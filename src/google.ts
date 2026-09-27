export interface Env { FIREBASE_PROJECT_ID: string; FIREBASE_API_KEY: string; FIREBASE_CLIENT_EMAIL: string; FIREBASE_PRIVATE_KEY: string; MAIL_ENCRYPTION_KEY?: string; GMAIL_CLIENT_ID?: string; GMAIL_CLIENT_SECRET?: string; GMAIL_REDIRECT_URI?: string; }
interface GoogleTokenResponse { access_token: string; expires_in: number; token_type: string; }
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
let cachedAccessToken:
	string | null = null;
let cachedAccessTokenExpiresAt = 0;
export async function getGoogleAccessToken(
	env: Env,
): Promise<string> {
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
			"https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore",
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
	cachedAccessToken =
		tokenData.access_token;
	cachedAccessTokenExpiresAt =
		Date.now() +
		tokenData.expires_in *
			1000;
	return cachedAccessToken;
}