# BigUkiUki Scrim Bot

Discord.js のスクリム募集Botを Railway で公開運用するための構成です。

## 必要な環境変数

Railway の Service Variables に設定します。

```env
TOKEN=Discord Bot Token
CLIENT_ID=Discord Application ID
COMMAND_SCOPE=global
```

PostgreSQLで保存する場合は、RailwayのPostgresを追加して `DATABASE_URL` も設定します。

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

`GUILD_ID` は公開運用では設定しません。テストサーバーだけにコマンドを即時反映したいときだけ、ローカルの `.env` に `GUILD_ID` を入れて `npm run register:guild` を使います。

## ローカル確認

```bash
npm install
npm run check
npm run register:global
npm run invite
npm start
```

`npm run invite` で表示されたURLを配ると、他のサーバー管理者がBotを追加できます。

## Railway デプロイ

1. このリポジトリを GitHub に push
2. Railway で `New Project` → `Deploy from GitHub repo`
3. Service Variables に `TOKEN`、`CLIENT_ID`、`COMMAND_SCOPE=global` を追加
4. 小規模運用なら Volume を接続して、Mount Path を `/data` にする
5. 広く公開するなら PostgreSQL を追加して、Bot Service の `DATABASE_URL` に `${{Postgres.DATABASE_URL}}` を設定
6. Deploy

`DATABASE_URL` がある場合、このBotはPostgreSQLにデータを保存します。`DATABASE_URL` がない場合は、Railway の Volume があれば自動で `/data/data.json` に保存します。

## 公開前の Discord 設定

Discord Developer Portal の対象Applicationで確認します。

- Bot Token を発行して `TOKEN` に設定
- General Information の Application ID を `CLIENT_ID` に設定
- Bot の `Public Bot` を ON
- Bot の `Requires OAuth2 Code Grant` を OFF
- Installation / OAuth2 の Guild Install に `bot` と `applications.commands` を含める

## Privacy

公開時は [PRIVACY.md](./PRIVACY.md) をGitHub上で確認できる状態にしてください。このBotはDiscordサーバーID、ユーザーID、チーム名、スクリム履歴、サーバー設定を保存します。

## コマンド登録

公開用:

```bash
npm run register:global
```

テストサーバーだけ:

```bash
npm run register:guild
```

グローバルコマンドは反映に少し時間がかかる場合があります。
