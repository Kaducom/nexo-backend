# NEXO

Este repositório reúne o backend de notificações e o aplicativo web atualizado.

| Caminho | Componente | Comando |
|---|---|---|
| `src/`, `wrangler.jsonc` | Worker de notificações Cloudflare | `npm run deploy` na raiz |
| `frontend/` | Aplicativo React/Vite | `npm --prefix frontend run build` após instalar as dependências do frontend |

O Worker existente mantém sua configuração e seus endpoints. O deploy do Worker na raiz não publica automaticamente `frontend/dist`: a hospedagem do aplicativo deve apontar para essa pasta de saída.

O aplicativo está hospedado no Firebase em `https://nexo-15b2c.web.app`. Execute `firebase deploy --only hosting --project nexo-15b2c` dentro de `frontend`, após o build, para atualizar esse endereço. GitHub, Firebase Hosting e Cloudflare são etapas distintas.

## Trabalhar na cópia vinculada ao Git

Abra um terminal na raiz deste repositório (a pasta que contém `.git`). Para conferir o vínculo:

```sh
git status
git remote -v
```

Para alterações no aplicativo:

```sh
cd frontend
npm ci
npm run build
cd ..
git add frontend
git commit -m "Atualiza aplicativo NEXO"
git push origin main
```

O histórico original do backend foi preservado. Não inicialize outro repositório dentro de `frontend`.

As variáveis privadas do Worker continuam nas secrets do Cloudflare. Arquivos locais `.env`, dependências, builds e credenciais não devem ser enviados ao GitHub.
