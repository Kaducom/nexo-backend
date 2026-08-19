interface Env {
	FIREBASE_PROJECT_ID: string;
	FIREBASE_CLIENT_EMAIL: string;
	FIREBASE_PRIVATE_KEY: string;
}

interface GoogleTokenResponse {
	access_token: string;
	expires_in: number;
	token_type: string;
}

interface NotificationPayload {
	token: string;
	title: string;
	body: string;
	url: string;
	tag: string;
}

/*
 * =========================================================
 * NEXO BACKEND
 * =========================================================
 *
 * Backend de notificações do NEXO.
 *
 * Fluxo:
 *
 * NEXO
 *   ↓
 * Cloudflare Worker
 *   ↓
 * Google OAuth
 *   ↓
 * Firebase Cloud Messaging
 *   ↓
 * Service Worker
 *   ↓
 * Windows / celular
 *
 * =========================================================
 */

/*
 * =========================================================
 * CORS
 * =========================================================
 *
 * Durante o desenvolvimento permitimos chamadas do
 * localhost e da futura versão web do NEXO.
 *
 * Como o NEXO é um projeto pessoal, mantemos "*" por
 * enquanto.
 *
 * Quando tivermos o domínio definitivo, podemos restringir
 * para ele.
 * =========================================================
 */

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",

	"Access-Control-Allow-Methods":
		"GET, POST, OPTIONS",

	"Access-Control-Allow-Headers":
		"Content-Type, Authorization",
};

/*
 * =========================================================
 * RESPOSTA JSON
 * =========================================================
 */

function jsonResponse(
	data: unknown,
	status = 200,
): Response {
	return Response.json(
		data,
		{
			status,
			headers: corsHeaders,
		},
	);
}

/*
 * =========================================================
 * BASE64 URL
 * =========================================================
 */

function base64UrlEncode(
	input: string | ArrayBuffer,
): string {
	let bytes: Uint8Array;

	if (typeof input === "string") {
		bytes =
			new TextEncoder().encode(
				input,
			);
	} else {
		bytes =
			new Uint8Array(
				input,
			);
	}

	let binary = "";

	for (const byte of bytes) {
		binary +=
			String.fromCharCode(
				byte,
			);
	}

	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/*
 * =========================================================
 * PRIVATE KEY PEM -> ARRAY BUFFER
 * =========================================================
 */

function pemToArrayBuffer(
	pem: string,
): ArrayBuffer {
	const normalizedPem =
		pem.replace(
			/\\n/g,
			"\n",
		);

	const base64 =
		normalizedPem
			.replace(
				"-----BEGIN PRIVATE KEY-----",
				"",
			)
			.replace(
				"-----END PRIVATE KEY-----",
				"",
			)
			.replace(
				/\s/g,
				"",
			);

	const binary =
		atob(base64);

	const bytes =
		new Uint8Array(
			binary.length,
		);

	for (
		let i = 0;
		i < binary.length;
		i++
	) {
		bytes[i] =
			binary.charCodeAt(i);
	}

	return bytes.buffer;
}

/*
 * =========================================================
 * CACHE DO GOOGLE ACCESS TOKEN
 * =========================================================
 *
 * Antes:
 *
 * Cada notificação gerava um novo OAuth Access Token.
 *
 * Agora:
 *
 * Enquanto o Worker permanecer ativo, reutilizamos o
 * Access Token até ele estar próximo da expiração.
 *
 * Isso reduz chamadas desnecessárias ao Google.
 * =========================================================
 */

let cachedAccessToken:
	string | null = null;

let cachedAccessTokenExpiresAt = 0;

/*
 * =========================================================
 * GOOGLE OAUTH ACCESS TOKEN
 * =========================================================
 */

async function getGoogleAccessToken(
	env: Env,
): Promise<string> {
	/*
	 * -------------------------------------------------------
	 * TOKEN EM CACHE
	 * -------------------------------------------------------
	 */

	const nowMilliseconds =
		Date.now();

	if (
		cachedAccessToken &&
		nowMilliseconds <
			cachedAccessTokenExpiresAt -
				60_000
	) {
		return cachedAccessToken;
	}

	/*
	 * -------------------------------------------------------
	 * CRIA JWT
	 * -------------------------------------------------------
	 */

	const now =
		Math.floor(
			Date.now() / 1000,
		);

	const header = {
		alg: "RS256",
		typ: "JWT",
	};

	const payload = {
		iss:
			env.FIREBASE_CLIENT_EMAIL,

		scope:
			"https://www.googleapis.com/auth/firebase.messaging",

		aud:
			"https://oauth2.googleapis.com/token",

		iat: now,

		exp:
			now + 3600,
	};

	const encodedHeader =
		base64UrlEncode(
			JSON.stringify(
				header,
			),
		);

	const encodedPayload =
		base64UrlEncode(
			JSON.stringify(
				payload,
			),
		);

	const unsignedToken =
		`${encodedHeader}.${encodedPayload}`;

	/*
	 * -------------------------------------------------------
	 * IMPORTA PRIVATE KEY
	 * -------------------------------------------------------
	 */

	const privateKey =
		await crypto.subtle.importKey(
			"pkcs8",

			pemToArrayBuffer(
				env.FIREBASE_PRIVATE_KEY,
			),

			{
				name:
					"RSASSA-PKCS1-v1_5",

				hash:
					"SHA-256",
			},

			false,

			["sign"],
		);

	/*
	 * -------------------------------------------------------
	 * ASSINA JWT
	 * -------------------------------------------------------
	 */

	const signature =
		await crypto.subtle.sign(
			"RSASSA-PKCS1-v1_5",

			privateKey,

			new TextEncoder().encode(
				unsignedToken,
			),
		);

	const jwt =
		`${unsignedToken}.${base64UrlEncode(
			signature,
		)}`;

	/*
	 * -------------------------------------------------------
	 * TROCA JWT POR ACCESS TOKEN GOOGLE
	 * -------------------------------------------------------
	 */

	const tokenResponse =
		await fetch(
			"https://oauth2.googleapis.com/token",

			{
				method:
					"POST",

				headers: {
					"Content-Type":
						"application/x-www-form-urlencoded",
				},

				body:
					new URLSearchParams(
						{
							grant_type:
								"urn:ietf:params:oauth:grant-type:jwt-bearer",

							assertion:
								jwt,
						},
					),
			},
		);

	if (!tokenResponse.ok) {
		const errorText =
			await tokenResponse.text();

		throw new Error(
			`Falha ao gerar token OAuth: ${errorText}`,
		);
	}

	const tokenData =
		(await tokenResponse.json()) as
			GoogleTokenResponse;

	/*
	 * -------------------------------------------------------
	 * SALVA EM CACHE
	 * -------------------------------------------------------
	 */

	cachedAccessToken =
		tokenData.access_token;

	cachedAccessTokenExpiresAt =
		Date.now() +
		tokenData.expires_in *
			1000;

	return cachedAccessToken;
}

/*
 * =========================================================
 * VALIDAÇÃO DO AMBIENTE
 * =========================================================
 */

function validateEnvironment(
	env: Env,
): void {
	const missingVariables:
		string[] = [];

	if (
		!env.FIREBASE_PROJECT_ID
	) {
		missingVariables.push(
			"FIREBASE_PROJECT_ID",
		);
	}

	if (
		!env.FIREBASE_CLIENT_EMAIL
	) {
		missingVariables.push(
			"FIREBASE_CLIENT_EMAIL",
		);
	}

	if (
		!env.FIREBASE_PRIVATE_KEY
	) {
		missingVariables.push(
			"FIREBASE_PRIVATE_KEY",
		);
	}

	if (
		missingVariables.length >
		0
	) {
		throw new Error(
			`Variáveis ausentes no Worker: ${missingVariables.join(
				", ",
			)}`,
		);
	}
}

/*
 * =========================================================
 * NORMALIZA NOTIFICAÇÃO
 * =========================================================
 */

function normalizeNotificationPayload(
	input: unknown,
): NotificationPayload {
	if (
		!input ||
		typeof input !== "object"
	) {
		throw new Error(
			"Payload da notificação inválido.",
		);
	}

	const data =
		input as Record<
			string,
			unknown
		>;

	/*
	 * -------------------------------------------------------
	 * TOKEN
	 * -------------------------------------------------------
	 */

	const token =
		typeof data.token ===
		"string"
			? data.token.trim()
			: "";

	if (!token) {
		throw new Error(
			"O token FCM é obrigatório.",
		);
	}

	/*
	 * -------------------------------------------------------
	 * TITLE
	 * -------------------------------------------------------
	 */

	const title =
		typeof data.title ===
			"string" &&
		data.title.trim()
			? data.title.trim()
			: "NEXO 🔔";

	/*
	 * -------------------------------------------------------
	 * BODY
	 * -------------------------------------------------------
	 */

	const body =
		typeof data.body ===
			"string" &&
		data.body.trim()
			? data.body.trim()
			: "Você tem um novo aviso.";

	/*
	 * -------------------------------------------------------
	 * URL
	 * -------------------------------------------------------
	 */

	const url =
		typeof data.url ===
			"string" &&
		data.url.trim()
			? data.url.trim()
			: "/";

	/*
	 * -------------------------------------------------------
	 * TAG
	 * -------------------------------------------------------
	 */

	const tag =
		typeof data.tag ===
			"string" &&
		data.tag.trim()
			? data.tag.trim()
			: "nexo-notification";

	/*
	 * -------------------------------------------------------
	 * LIMITES
	 * -------------------------------------------------------
	 */

	if (
		token.length >
		4096
	) {
		throw new Error(
			"Token FCM inválido.",
		);
	}

	if (
		title.length >
		120
	) {
		throw new Error(
			"O título excede 120 caracteres.",
		);
	}

	if (
		body.length >
		500
	) {
		throw new Error(
			"A mensagem excede 500 caracteres.",
		);
	}

	if (
		url.length >
		500
	) {
		throw new Error(
			"A URL excede 500 caracteres.",
		);
	}

	if (
		tag.length >
		120
	) {
		throw new Error(
			"A tag excede 120 caracteres.",
		);
	}

	return {
		token,
		title,
		body,
		url,
		tag,
	};
}

/*
 * =========================================================
 * ENVIO DA NOTIFICAÇÃO PELO FCM
 * =========================================================
 */

async function sendNotification(
	env: Env,
	notification:
		NotificationPayload,
): Promise<unknown> {
	/*
	 * -------------------------------------------------------
	 * CONFERE CONFIGURAÇÃO
	 * -------------------------------------------------------
	 */

	validateEnvironment(
		env,
	);

	/*
	 * -------------------------------------------------------
	 * GOOGLE ACCESS TOKEN
	 * -------------------------------------------------------
	 */

	const accessToken =
		await getGoogleAccessToken(
			env,
		);

	/*
	 * -------------------------------------------------------
	 * FIREBASE CLOUD MESSAGING
	 * -------------------------------------------------------
	 */

	const response =
		await fetch(
			`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`,

			{
				method:
					"POST",

				headers: {
					Authorization:
						`Bearer ${accessToken}`,

					"Content-Type":
						"application/json",
				},

				body:
					JSON.stringify(
						{
							message: {
								token:
									notification.token,

								/*
								 * DATA-ONLY
								 *
								 * O Service Worker do NEXO
								 * recebe estes dados e
								 * monta a notificação.
								 */

								data: {
									title:
										notification.title,

									body:
										notification.body,

									url:
										notification.url,

									tag:
										notification.tag,
								},

								webpush: {
									headers: {
										Urgency:
											"high",
									},
								},
							},
						},
					),
			},
		);

	const text =
		await response.text();

	if (!response.ok) {
		throw new Error(
			`FCM respondeu ${response.status}: ${text}`,
		);
	}

	try {
		return JSON.parse(
			text,
		);
	} catch {
		return text;
	}
}

/*
 * =========================================================
 * CLOUDFLARE WORKER
 * =========================================================
 */

export default {
	async fetch(
		request: Request,
		env: Env,
	): Promise<Response> {
		const url =
			new URL(
				request.url,
			);

		/*
		 * ===================================================
		 * CORS PREFLIGHT
		 * ===================================================
		 */

		if (
			request.method ===
			"OPTIONS"
		) {
			return new Response(
				null,
				{
					status: 204,

					headers:
						corsHeaders,
				},
			);
		}

		/*
		 * ===================================================
		 * HEALTH CHECK
		 * ===================================================
		 *
		 * GET /
		 *
		 * Não mostramos mais informações das credenciais.
		 * O diagnóstico que usamos durante a configuração
		 * não é mais necessário.
		 */

		if (
			url.pathname ===
			"/"
		) {
			return jsonResponse(
				{
					success:
						true,

					service:
						"NEXO Backend",

					runtime:
						"Cloudflare Workers",

					status:
						"online",
				},
			);
		}

		/*
		 * ===================================================
		 * API REAL DE NOTIFICAÇÕES
		 * ===================================================
		 *
		 * POST /notifications/send
		 *
		 * BODY:
		 *
		 * {
		 *   "token": "...",
		 *   "title": "NEXO",
		 *   "body": "Mensagem",
		 *   "url": "/lembretes",
		 *   "tag": "lembrete-123"
		 * }
		 *
		 * Essa será a rota utilizada posteriormente pelo
		 * sistema real de lembretes.
		 */

		if (
			url.pathname ===
				"/notifications/send" &&
			request.method ===
				"POST"
		) {
			try {
				/*
				 * -------------------------------------------
				 * LÊ JSON
				 * -------------------------------------------
				 */

				const input =
					await request.json();

				/*
				 * -------------------------------------------
				 * VALIDA / NORMALIZA
				 * -------------------------------------------
				 */

				const notification =
					normalizeNotificationPayload(
						input,
					);

				/*
				 * -------------------------------------------
				 * LOG SEGURO
				 * -------------------------------------------
				 *
				 * Não colocamos o token completo no log.
				 */

				console.log(
					"[NEXO] Enviando notificação.",
					{
						title:
							notification.title,

						tag:
							notification.tag,

						tokenLength:
							notification
								.token
								.length,
					},
				);

				/*
				 * -------------------------------------------
				 * ENVIA
				 * -------------------------------------------
				 */

				const result =
					await sendNotification(
						env,
						notification,
					);

				console.log(
					"[NEXO] Notificação enviada com sucesso.",
				);

				/*
				 * -------------------------------------------
				 * SUCESSO
				 * -------------------------------------------
				 */

				return jsonResponse(
					{
						success:
							true,

						result,
					},
				);
			} catch (error) {
				console.error(
					"[NEXO] Falha ao enviar notificação.",
					error,
				);

				return jsonResponse(
					{
						success:
							false,

						error:
							"notification-send-failed",

						message:
							error instanceof
							Error
								? error.message
								: String(
										error,
									),
					},

					500,
				);
			}
		}

		/*
		 * ===================================================
		 * ROTA DE TESTE
		 * ===================================================
		 *
		 * GET /sendTestNotification?token=FCM_TOKEN
		 *
		 * Mantemos essa rota porque ela é útil para
		 * diagnóstico.
		 *
		 * Foi ela que provou que todo nosso circuito
		 * FCM está funcionando.
		 */

		if (
			url.pathname ===
				"/sendTestNotification" &&
			request.method ===
				"GET"
		) {
			const token =
				url.searchParams.get(
					"token",
				);

			if (!token) {
				return jsonResponse(
					{
						success:
							false,

						error:
							"missing-token",

						message:
							"Informe o FCM Registration Token em ?token=...",
					},

					400,
				);
			}

			try {
				console.log(
					"[NEXO] Executando teste de notificação.",
				);

				const result =
					await sendNotification(
						env,
						{
							token,

							title:
								"NEXO 🔔",

							body:
								"Sistema de notificações funcionando.",

							url:
								"/lembretes",

							tag:
								"nexo-notification-test",
						},
					);

				return jsonResponse(
					{
						success:
							true,

						result,
					},
				);
			} catch (error) {
				console.error(
					"[NEXO] Falha no teste de notificação.",
					error,
				);

				return jsonResponse(
					{
						success:
							false,

						error:
							"notification-send-failed",

						message:
							error instanceof
							Error
								? error.message
								: String(
										error,
									),
					},

					500,
				);
			}
		}

		/*
		 * ===================================================
		 * MÉTODO INCORRETO
		 * ===================================================
		 */

		if (
			url.pathname ===
			"/notifications/send"
		) {
			return jsonResponse(
				{
					success:
						false,

					error:
						"method-not-allowed",

					message:
						"Use POST para enviar notificações.",
				},

				405,
			);
		}

		/*
		 * ===================================================
		 * NOT FOUND
		 * ===================================================
		 */

		return jsonResponse(
			{
				success:
					false,

				error:
					"not-found",
			},

			404,
		);
	},
} satisfies ExportedHandler<Env>;