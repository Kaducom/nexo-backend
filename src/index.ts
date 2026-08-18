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

/*
 * =========================================================
 * CORS
 * =========================================================
 *
 * Durante o desenvolvimento permitimos qualquer origem.
 *
 * Depois, quando o NEXO estiver definitivamente publicado,
 * podemos restringir isso somente ao domínio oficial.
 * =========================================================
 */

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/*
 * =========================================================
 * RESPOSTA JSON COM CORS
 * =========================================================
 */

function jsonResponse(
	data: unknown,
	status = 200,
): Response {
	return Response.json(data, {
		status,
		headers: corsHeaders,
	});
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
		bytes = new TextEncoder().encode(input);
	} else {
		bytes = new Uint8Array(input);
	}

	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
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
	/*
	 * A chave pode chegar do Cloudflare com "\n"
	 * literalmente ou com quebras de linha reais.
	 */

	const normalizedPem =
		pem.replace(/\\n/g, "\n");

	const base64 = normalizedPem
		.replace(
			"-----BEGIN PRIVATE KEY-----",
			"",
		)
		.replace(
			"-----END PRIVATE KEY-----",
			"",
		)
		.replace(/\s/g, "");

	const binary = atob(base64);

	const bytes =
		new Uint8Array(binary.length);

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
 * GOOGLE OAUTH ACCESS TOKEN
 * =========================================================
 */

async function getGoogleAccessToken(
	env: Env,
): Promise<string> {
	const now =
		Math.floor(Date.now() / 1000);

	const header = {
		alg: "RS256",
		typ: "JWT",
	};

	const payload = {
		iss: env.FIREBASE_CLIENT_EMAIL,

		scope:
			"https://www.googleapis.com/auth/firebase.messaging",

		aud:
			"https://oauth2.googleapis.com/token",

		iat: now,
		exp: now + 3600,
	};

	const encodedHeader =
		base64UrlEncode(
			JSON.stringify(header),
		);

	const encodedPayload =
		base64UrlEncode(
			JSON.stringify(payload),
		);

	const unsignedToken =
		`${encodedHeader}.${encodedPayload}`;

	/*
	 * -------------------------------------------------------
	 * IMPORTA CHAVE PRIVADA
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

				hash: "SHA-256",
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
				method: "POST",

				headers: {
					"Content-Type":
						"application/x-www-form-urlencoded",
				},

				body:
					new URLSearchParams({
						grant_type:
							"urn:ietf:params:oauth:grant-type:jwt-bearer",

						assertion: jwt,
					}),
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
		(await tokenResponse.json()) as GoogleTokenResponse;

	return tokenData.access_token;
}

/*
 * =========================================================
 * ENVIO DA NOTIFICAÇÃO PELO FCM
 * =========================================================
 */

async function sendNotification(
	env: Env,
	token: string,
): Promise<unknown> {
	const accessToken =
		await getGoogleAccessToken(env);

	const response =
		await fetch(
			`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`,

			{
				method: "POST",

				headers: {
					Authorization:
						`Bearer ${accessToken}`,

					"Content-Type":
						"application/json",
				},

				body: JSON.stringify({
					message: {
						/*
						 * IMPORTANTE:
						 *
						 * Aqui usamos o FCM Registration
						 * Token retornado pelo getToken()
						 * do frontend.
						 */

						token,

						/*
						 * DATA-ONLY MESSAGE
						 *
						 * O Service Worker do NEXO
						 * recebe esses dados e exibe
						 * a notificação.
						 */

						data: {
							title:
								"NEXO 🔔",

							body:
								"Cloudflare Worker do NEXO está funcionando 😈",

							url:
								"/lembretes",

							tag:
								"nexo-cloudflare-test",
						},

						webpush: {
							headers: {
								Urgency:
									"high",
							},
						},
					},
				}),
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
		return JSON.parse(text);
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
			new URL(request.url);

		/*
		 * ---------------------------------------------------
		 * CORS PREFLIGHT
		 * ---------------------------------------------------
		 *
		 * O navegador pode fazer uma requisição OPTIONS
		 * antes da requisição real.
		 *
		 * Respondemos imediatamente autorizando o frontend.
		 * ---------------------------------------------------
		 */

		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: corsHeaders,
			});
		}

		/*
		 * ---------------------------------------------------
		 * HEALTH CHECK
		 * ---------------------------------------------------
		 */

		if (url.pathname === "/") {
			return jsonResponse({
				success: true,

				service:
					"NEXO Backend",

				runtime:
					"Cloudflare Workers",
			});
		}

		/*
		 * ---------------------------------------------------
		 * TESTE DE NOTIFICAÇÃO
		 * ---------------------------------------------------
		 *
		 * Exemplo:
		 *
		 * /sendTestNotification?token=FCM_TOKEN
		 *
		 */

		if (
			url.pathname ===
			"/sendTestNotification"
		) {
			const token =
				url.searchParams.get(
					"token",
				);

			/*
			 * -----------------------------------------------
			 * TOKEN OBRIGATÓRIO
			 * -----------------------------------------------
			 */

			if (!token) {
				return jsonResponse(
					{
						success: false,

						error:
							"missing-token",

						message:
							"Informe o FCM Registration Token em ?token=...",
					},

					400,
				);
			}

			/*
			 * -----------------------------------------------
			 * ENVIO
			 * -----------------------------------------------
			 */

			try {
				console.log(
					"[NEXO] Enviando notificação FCM.",
				);

				console.log(
					"[NEXO] Tamanho do registration token:",
					token.length,
				);

				const result =
					await sendNotification(
						env,
						token,
					);

				console.log(
					"[NEXO] Notificação enviada com sucesso.",
					result,
				);

				return jsonResponse({
					success: true,
					result,
				});
			} catch (error) {
				/*
				 * -------------------------------------------
				 * ERRO
				 * -------------------------------------------
				 */

				console.error(
					"[NEXO] Falha ao enviar notificação.",
					error,
				);

				return jsonResponse(
					{
						success: false,

						error:
							"notification-send-failed",

						message:
							error instanceof Error
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
		 * ---------------------------------------------------
		 * ROTA NÃO ENCONTRADA
		 * ---------------------------------------------------
		 */

		return jsonResponse(
			{
				success: false,
				error: "not-found",
			},

			404,
		);
	},
} satisfies ExportedHandler<Env>;