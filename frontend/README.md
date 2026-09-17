# NEXO — aplicativo web

Interface React/Vite do NEXO, com o redesign e as entradas Nubank/Apple Pay.

## Desenvolvimento

```sh
cd frontend
npm ci
npm run dev
```

Copie `.env.example` para `.env.local` e configure `VITE_FIREBASE_VAPID_KEY` para habilitar o registro de notificações. A chave VAPID é pública; credenciais de conta de serviço nunca devem usar o prefixo `VITE_`.

## Build

```sh
npm run build
```

O resultado fica em `frontend/dist`. O servidor precisa servir `index.html` para rotas da aplicação, incluindo `/financas/importar`. O frontend usa Firebase Authentication, Firestore para sincronização por conta e IndexedDB para acesso offline. Publique as regras antes do Hosting, usando o script da raiz. Consulte [SINCRONIZACAO.md](SINCRONIZACAO.md) para migração, testes e funcionamento. O Worker de notificações permanece na raiz do repositório.

## Publicar no endereço existente

Dentro de `frontend`, após o build e o login no Firebase CLI:

```sh
firebase deploy --only hosting --project nexo-15b2c
```

O destino é `https://nexo-15b2c.web.app`. O comando publica apenas o frontend. O push ao GitHub guarda o código; sem uma automação de Firebase Hosting configurada, ele não publica o aplicativo por si só.

## Funcionalidades incluídas

- Layout responsivo, Home, memórias, lembretes, finanças, busca e configurações.
- Importação local OFX/CSV de conta ou cartão Nubank, prévia e revisão de duplicatas.
- Pendentes de classificação, regras por estabelecimento e histórico com reabertura.
- Recebimento de compras pelo Atalhos do iPhone ao abrir o NEXO no Safari.

Veja [NUBANK-IPHONE.md](NUBANK-IPHONE.md) para configurar a automação e entender seus limites. O código não inclui uma automação instalada no iPhone nem conexão Open Finance.

## Testes

O diretório `qa` contém testes do frontend e das importações. Veja [qa/README.md](qa/README.md). A autenticação e o envio de notificações são simulados apenas no servidor de testes; o produto usa os serviços reais.

## Persistência

Os dados financeiros continuam locais no navegador. Publicar em outro domínio não transfere o IndexedDB do endereço anterior. A migração para a versão 4 preserva as tabelas existentes quando o app é atualizado no mesmo endereço e navegador.
