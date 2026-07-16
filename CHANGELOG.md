## [1.5.0](https://github.com/nmime/nest-react-boilerplate/compare/v1.4.0...v1.5.0) (2026-07-16)

## [1.4.0](https://github.com/nmime/nest-react-boilerplate/compare/v1.3.2...v1.4.0) (2026-07-16)

## [1.3.2](https://github.com/nmime/nest-react-boilerplate/compare/v1.3.1...v1.3.2) (2026-07-15)

## [1.3.1](https://github.com/nmime/nest-react-boilerplate/compare/v1.3.0...v1.3.1) (2026-07-15)

## [1.3.0](https://github.com/nmime/nest-react-boilerplate/compare/v1.2.0...v1.3.0) (2026-07-15)

## [1.2.0](https://github.com/nmime/nest-react-boilerplate/compare/v1.1.5...v1.2.0) (2026-07-14)

## [1.1.5](https://github.com/nmime/nest-react-boilerplate/compare/v1.1.4...v1.1.5) (2026-07-14)

## [1.1.4](https://github.com/nmime/nest-react-boilerplate/compare/v1.1.3...v1.1.4) (2026-07-14)

## [1.1.3](https://github.com/nmime/nest-react-boilerplate/compare/v1.1.2...v1.1.3) (2026-07-14)

## [1.1.2](https://github.com/nmime/nest-react-boilerplate/compare/v1.1.1...v1.1.2) (2026-07-14)

## [1.1.1](https://github.com/nmime/nest-react-boilerplate/compare/v1.1.0...v1.1.1) (2026-07-14)

## [1.1.0](https://github.com/nmime/nest-react-boilerplate/compare/v1.0.0...v1.1.0) (2026-07-14)

## 1.0.0 (2026-07-13)

### Features

- add GitOps CI/CD pipeline with ArgoCD ([c126143](https://github.com/nmime/nest-react-boilerplate/commit/c126143d3230fde021dfff15095c18c3f95260ff))
- add tests for site/mobile/ui-native apps, expand docker-compose with Redis/NATS/MinIO ([e753c2c](https://github.com/nmime/nest-react-boilerplate/commit/e753c2c544b967588ef5735acc69d11f10e681f8))
- **analytics:** add backend provider factory and HTTP providers ([31441e7](https://github.com/nmime/nest-react-boilerplate/commit/31441e75d87ca392f93fe4f1dfd659ceb4dcc588))
- **auth:** add better-auth types, session types, and migration scripts ([f741006](https://github.com/nmime/nest-react-boilerplate/commit/f741006370e7823e0b9f95e77485b22098d4c8e3))
- **auth:** add production-quality avatar support ([edb68b7](https://github.com/nmime/nest-react-boilerplate/commit/edb68b7f66aa11a92496adf7dcc8c5573d00b842))
- **auth:** persist auth tokens in postgres repositories ([dd5c7e1](https://github.com/nmime/nest-react-boilerplate/commit/dd5c7e1378e286c40d8cdb50492c804e34d37522))
- **auth:** wire postgres-backed token store ([336021c](https://github.com/nmime/nest-react-boilerplate/commit/336021c88c6ea37e08cd6315291485bb08542706))
- **cli:** add interactive boilerplate setup and doctor ([71b65ed](https://github.com/nmime/nest-react-boilerplate/commit/71b65edda2a03f4c98d36fd7c3908161c81d1537))
- **common-logger:** add structured redacted logger ([a049167](https://github.com/nmime/nest-react-boilerplate/commit/a049167f4cbf704854db43221ad6e970ef3f0a9e))
- complete template hardening — 14-point gap closure ([058a569](https://github.com/nmime/nest-react-boilerplate/commit/058a56928a976619bdddcde63146fe0e7b8c9e23))
- **config:** require explicit collision-free service ports ([28940b3](https://github.com/nmime/nest-react-boilerplate/commit/28940b36514b6f54db7080052eac2e7c504cfe73))
- **deploy:** enable Coroot in production K8s deploy values ([564e9d6](https://github.com/nmime/nest-react-boilerplate/commit/564e9d64fe19cf69c78f8a4e4042bf379dba33cb))
- **exceptions:** align Problem Details with RFC 9457 deltas ([51f38d7](https://github.com/nmime/nest-react-boilerplate/commit/51f38d78084e1f4b431d1631ceda842cfe6ac07b))
- **feature-flags:** back flags with postgres ([3f6b240](https://github.com/nmime/nest-react-boilerplate/commit/3f6b24061c728ea1afb7bdaca62a508d5867cb42))
- **frontend-ui:** overhaul shadcn design system ([7494bd1](https://github.com/nmime/nest-react-boilerplate/commit/7494bd1f7dcc5b21110b1793cb21a6dfbe18647b))
- **frontend:** add API resilience runtime ([fb53e91](https://github.com/nmime/nest-react-boilerplate/commit/fb53e9132cfb61f6a23cfea793d1cd48d5b70c47))
- **frontend:** add platform foundation stores and utilities ([323096e](https://github.com/nmime/nest-react-boilerplate/commit/323096e7fb0316d72bf7dc2285d7eae8e01c9294))
- **frontend:** enforce strict FSD checks ([b6a60bd](https://github.com/nmime/nest-react-boilerplate/commit/b6a60bd86cc272b879b5f539913e15c2113434ec))
- **frontend:** refresh user app design v3 ([daba13d](https://github.com/nmime/nest-react-boilerplate/commit/daba13d599b28d673e690c1e80c63df531bdfa09))
- **frontend:** wire auth refresh mutex, generated toast rules, and MobXQuery ([f6f07f0](https://github.com/nmime/nest-react-boilerplate/commit/f6f07f04ddb97c0bc6de9552cdca0dfc8027d7b5))
- **frontend:** wire integration runtime ([49d6786](https://github.com/nmime/nest-react-boilerplate/commit/49d6786229d6aaf77a85e88dc6cba12dd9674302))
- **health:** add dependency health indicators ([73008fe](https://github.com/nmime/nest-react-boilerplate/commit/73008feb0b9591327ae090940ce4429ad4da2f1c))
- **health:** add shared health foundation ([a57876c](https://github.com/nmime/nest-react-boilerplate/commit/a57876c53cbf04d2e618ec8fa5613565dd4df9e9))
- **health:** integrate shared backend health checks ([5126eff](https://github.com/nmime/nest-react-boilerplate/commit/5126eff99b6e78543e4b1bf617f11abbc9c951a8))
- isolate frontend i18n rebuilds ([4b0329b](https://github.com/nmime/nest-react-boilerplate/commit/4b0329b4ca245be3f8e05e26213a00a35b994c08))
- migrate ioredis → redis v6 (native node-redis), remove grammyjs/storage-redis ([a4732db](https://github.com/nmime/nest-react-boilerplate/commit/a4732dba7244ce85a877e01006c3c8431fbcb005))
- **nx:** declare and implement boilerplate generators ([b463aae](https://github.com/nmime/nest-react-boilerplate/commit/b463aaeff0dccc067be7c6ce4f9bfd80cf7f6884))
- **ops:** add Coroot to Helm chart for auto-discovering app observability ([9899e15](https://github.com/nmime/nest-react-boilerplate/commit/9899e152519a99864b2402c89c04c870a21ec7b5))
- **ops:** add production observability stack (OTel, Prometheus, Alertmanager, Grafana), fix Helm network-policy, fix port validators ([f4dea62](https://github.com/nmime/nest-react-boilerplate/commit/f4dea62789c1e602a72a3a702beece9c6fc82f6c))
- **redis:** back cache service with cacheable ([c654bbe](https://github.com/nmime/nest-react-boilerplate/commit/c654bbed4d9819323e69482074c1060bda47e67a))
- scope frontend i18n catalogs ([2952c60](https://github.com/nmime/nest-react-boilerplate/commit/2952c6065aeccb36a03c8aab8afe5a3b9d17ce17))
- **tooling:** add deterministic db seed factory primitives ([b3ea012](https://github.com/nmime/nest-react-boilerplate/commit/b3ea012a033b57730e0a0c7583a538150dbdc736))
- **tooling:** add deterministic setup planner, state, apply, and node filesystem adapter ([46acc6a](https://github.com/nmime/nest-react-boilerplate/commit/46acc6a62dc716d1a5938e3c77e78a0d4a99e39d))
- **tooling:** define boilerplate setup configuration ([728b70e](https://github.com/nmime/nest-react-boilerplate/commit/728b70e5241684108b4c1cf336333a1bd2cfdba4))

### Bug Fixes

- add Helm rate limit values ([9805dbd](https://github.com/nmime/nest-react-boilerplate/commit/9805dbd3ae620aa8a1bdf1eaa18da6b3dbc5e794))
- address audit findings (CI gate, CodeQL build, prettier, gitattributes, dockerignore, tag script) ([a7bf429](https://github.com/nmime/nest-react-boilerplate/commit/a7bf42985e1c4272e6ec1ec3438ac09af78fbe6b))
- **admin:** clear residual strict FSD imports ([4854c44](https://github.com/nmime/nest-react-boilerplate/commit/4854c441ccd8df99ffb1a820e1211388d3ea92b8))
- **admin:** preserve bearer token for preference updates ([064218e](https://github.com/nmime/nest-react-boilerplate/commit/064218e21b20652b647df80182fad2dc39f26eb2))
- **admin:** resolve a11y runtime merge ([9d67440](https://github.com/nmime/nest-react-boilerplate/commit/9d674400cedab8bbbc0bde319fd5b471d9de2597))
- **admin:** split admin pages and localize copy ([#140](https://github.com/nmime/nest-react-boilerplate/issues/140)) ([05c1901](https://github.com/nmime/nest-react-boilerplate/commit/05c19011f3a1b3cba332e434eb29941118cc4b6b))
- align admin audit migration index names ([#145](https://github.com/nmime/nest-react-boilerplate/issues/145)) ([eb514ba](https://github.com/nmime/nest-react-boilerplate/commit/eb514bace8732aa2f091fb8c5f89d8c0065b43ae))
- align OpenAPI auth contract hygiene ([65fe44d](https://github.com/nmime/nest-react-boilerplate/commit/65fe44d83021739143b50ef530fc3b0ee028e6b5))
- **analytics:** harden backend provider payloads ([71aa6db](https://github.com/nmime/nest-react-boilerplate/commit/71aa6db88c7512f3f9b9ef4202aea503b52badc1))
- **api:** harden password hash verification ([#55](https://github.com/nmime/nest-react-boilerplate/issues/55)) ([1504942](https://github.com/nmime/nest-react-boilerplate/commit/1504942fe7cc9d640d48f9045df66f309349108e))
- **apps:** remove stale physical Vite config imports ([d621436](https://github.com/nmime/nest-react-boilerplate/commit/d62143697e1bc68974afb3481820185527dd38e5))
- **auth:** align locale persistence schema ([2ad8bdc](https://github.com/nmime/nest-react-boilerplate/commit/2ad8bdceffc98dc47de9766c46b6a4157719b2c6)), closes [#136](https://github.com/nmime/nest-react-boilerplate/issues/136)
- **auth:** complete Better-Auth integration, lint zero, and ESLint overrides ([8f45fd9](https://github.com/nmime/nest-react-boilerplate/commit/8f45fd98209986e77831b258ab389040c378e096))
- **auth:** complete Better-Auth integration, lint zero, and ESLint overrides ([419f44b](https://github.com/nmime/nest-react-boilerplate/commit/419f44bc81e21ae373ea3da23fde51bf3c1f522c))
- **auth:** document tenant persistence scaffolding metadata ([#147](https://github.com/nmime/nest-react-boilerplate/issues/147)) ([75baca1](https://github.com/nmime/nest-react-boilerplate/commit/75baca10affb6517bb2296fb8fe16f56b6803a59))
- **auth:** preserve in-memory token lookup semantics ([1da5022](https://github.com/nmime/nest-react-boilerplate/commit/1da50222e994bf78fc7a63a532a2be0ef85942ba))
- **auth:** support session self endpoints and DTO enums ([#150](https://github.com/nmime/nest-react-boilerplate/issues/150)) ([0c2b025](https://github.com/nmime/nest-react-boilerplate/commit/0c2b025a3e53ed5e3bf00089eedc0bdc94db9681))
- **ci:** align pnpm runtime and canonical attribution ([47f66b1](https://github.com/nmime/nest-react-boilerplate/commit/47f66b1482bf05efda8ec7708175f0565dc937e5))
- **ci:** enforce canonical generated artifacts and migration safety ([8feecbf](https://github.com/nmime/nest-react-boilerplate/commit/8feecbf49e921ec7b854bf7193a81ecb05bb1e3b))
- **ci:** exempt scorecard.yml from packages/id-token write check ([73ac183](https://github.com/nmime/nest-react-boilerplate/commit/73ac1837f2b8b439dc0dbf13056c00e22f7c30d1))
- **ci:** make deployment config validator quote-agnostic ([62b4408](https://github.com/nmime/nest-react-boilerplate/commit/62b44081c7e33504c2eace062bb86513a487dce7))
- **ci:** restore security and full-build gates ([72ba673](https://github.com/nmime/nest-react-boilerplate/commit/72ba6739a785a8f171f988cffeb4c41888ca95e4))
- clamp auth token cleanup interval ([d9d11f8](https://github.com/nmime/nest-react-boilerplate/commit/d9d11f88526dc087ae9a91f2cdd3e0905804e186))
- clean backend layout audit findings ([6199d70](https://github.com/nmime/nest-react-boilerplate/commit/6199d70331644d4a32799008f990c2c644a400af))
- clear broad lint final validation blockers ([a32bccb](https://github.com/nmime/nest-react-boilerplate/commit/a32bccb6bcd600bf7dcf8dee596f34796502496f))
- clear user app final validation blockers ([8177ad2](https://github.com/nmime/nest-react-boilerplate/commit/8177ad2b5441566c5687b9a7ce733a60a425aca7))
- **cli:** make workspace nrb script executable ([d0c5ce7](https://github.com/nmime/nest-react-boilerplate/commit/d0c5ce737169a61aab7a21401ef61ce76f579936))
- **common-config:** restore shared config library ([ad7c763](https://github.com/nmime/nest-react-boilerplate/commit/ad7c7633eb2ec7a9d6d06eb590638a4307174726))
- **common-logger:** satisfy logger lint ([36db2bf](https://github.com/nmime/nest-react-boilerplate/commit/36db2bfc5ed281398a0625eda924a911927f64ac))
- **common:** clear final lint blockers ([e4995ca](https://github.com/nmime/nest-react-boilerplate/commit/e4995ca326ed0e7c6f4b5d1e9c6a84b8e697b769))
- **compose:** harden production Redis smoke config ([#62](https://github.com/nmime/nest-react-boilerplate/issues/62)) ([e6ff536](https://github.com/nmime/nest-react-boilerplate/commit/e6ff536cab2498f7221dd62f583f2349d3d36178))
- configure Helm Redis rate limiting ([503e766](https://github.com/nmime/nest-react-boilerplate/commit/503e76627b7d522dc9aa0effba22dd7b202909f1))
- consolidate pass 3 deployment config fixes ([#76](https://github.com/nmime/nest-react-boilerplate/issues/76)) ([ee8eb16](https://github.com/nmime/nest-react-boilerplate/commit/ee8eb1696dfa2db1725f30410e1fc10fdb445fdf))
- correct Node 24 references (was 26/22 in some docs) ([98e75ac](https://github.com/nmime/nest-react-boilerplate/commit/98e75ac9eb4aa56a33a7c843a0c025a8c687fa90))
- correct Node 24 references in .env examples and GITOPS.md ([219349a](https://github.com/nmime/nest-react-boilerplate/commit/219349aa48675aa6e9890bab5ce1cb44d758ae66))
- cursor rules, contributing changelog, security contact, migration scaffold, stale files ([acc42f4](https://github.com/nmime/nest-react-boilerplate/commit/acc42f40f03b45b8b3fbccf62909190673cce801))
- **deploy:** remove telegram worker from Helm (polling is local dev only) ([a1ec42e](https://github.com/nmime/nest-react-boilerplate/commit/a1ec42e7e385b85103038b990db2b6355e5ea105))
- **deploy:** update deploy workflow and tag script for values-production.yaml ([540ec2a](https://github.com/nmime/nest-react-boilerplate/commit/540ec2ae9953406910fea8de18f222d7413cdde0))
- **deploy:** use production values in ArgoCD app, pin Coroot version, fix image repos ([1441ee2](https://github.com/nmime/nest-react-boilerplate/commit/1441ee2be45aeade509c301768f4e65f2ad0f106))
- **deploy:** validate shared health integration ([8a4fd5b](https://github.com/nmime/nest-react-boilerplate/commit/8a4fd5b0cb8d2ea6a6270b46ff5cc2b6893bd989))
- **deps:** align compatible workspace dependencies ([0e69324](https://github.com/nmime/nest-react-boilerplate/commit/0e693242f804e4a09f806918b279ccc091625c36))
- **deps:** finish security remediation and verification ([0da2282](https://github.com/nmime/nest-react-boilerplate/commit/0da22822f3fa6c222f9a55d4023174122259c830))
- **deps:** patch CASL ability advisory ([7d61df4](https://github.com/nmime/nest-react-boilerplate/commit/7d61df4d09fc79d183b7144ad355ef9c1c745ba2))
- **deps:** remediate webpack development advisories ([11dec32](https://github.com/nmime/nest-react-boilerplate/commit/11dec326499a98d356ce2e957eca1ce9abfc3c43))
- Docker Node.js version (26->22), site build stage, tsconfig moduleResolution, dependabot reviewers ([4c14b51](https://github.com/nmime/nest-react-boilerplate/commit/4c14b51dc6dc69734becdd33c48aa546e4cc8066))
- **docs:** apply Prettier formatting to 6 doc files failing format:check gate ([f63bc5a](https://github.com/nmime/nest-react-boilerplate/commit/f63bc5abfb13d27c2b3d65c7ca4e4e153770679c))
- enforce postgres auth module boundary guard ([cff49f3](https://github.com/nmime/nest-react-boilerplate/commit/cff49f32f908bd1db8d2445768f60f79230143ed)), closes [#146](https://github.com/nmime/nest-react-boilerplate/issues/146)
- enforce production JWT secret length ([#80](https://github.com/nmime/nest-react-boilerplate/issues/80)) ([b2e215b](https://github.com/nmime/nest-react-boilerplate/commit/b2e215b0658d4a1e5ea07917267b15df4df83287))
- enforce production JWT verifier secret length ([#84](https://github.com/nmime/nest-react-boilerplate/issues/84)) ([dc02b41](https://github.com/nmime/nest-react-boilerplate/commit/dc02b41649c1de12ea835a899f77dac6a7cd5949))
- flatten nested DTO validation problem details ([#68](https://github.com/nmime/nest-react-boilerplate/issues/68)) ([9875e97](https://github.com/nmime/nest-react-boilerplate/commit/9875e9717af3ad196075b4abdc56ef84488d34c8))
- **frontend-api-client:** resolve 31 ESLint errors in use-auth-session-flow ([6185ba2](https://github.com/nmime/nest-react-boilerplate/commit/6185ba2fd40c6a86d55adfc61971e1b13bd2aa77))
- **frontend:** align admin tests with FSD enforcement ([8886a98](https://github.com/nmime/nest-react-boilerplate/commit/8886a98eab88937319899e19a6babad205b120c0))
- **frontend:** announce error boundary fallback ([f796b00](https://github.com/nmime/nest-react-boilerplate/commit/f796b00fd8141196eda7d8eeabe34061685187fa))
- **frontend:** enforce shared library FSD boundaries ([4a11e7f](https://github.com/nmime/nest-react-boilerplate/commit/4a11e7f953f4202c8cb8173d7e0027aaa9b01846))
- **frontend:** fail fast when React roots are missing ([#56](https://github.com/nmime/nest-react-boilerplate/issues/56)) ([fb55cef](https://github.com/nmime/nest-react-boilerplate/commit/fb55cef78bd28c81c6c5478a2414bcecbe7b8194)), closes [#root](https://github.com/nmime/nest-react-boilerplate/issues/root)
- **frontend:** isolate API client support boundaries ([#151](https://github.com/nmime/nest-react-boilerplate/issues/151)) ([27e4ba4](https://github.com/nmime/nest-react-boilerplate/commit/27e4ba4b339d3827063af5137a59c7f1dbb355e9))
- **frontend:** localize ProductShell Russian home label ([#92](https://github.com/nmime/nest-react-boilerplate/issues/92)) ([9c5c3b4](https://github.com/nmime/nest-react-boilerplate/commit/9c5c3b45b132728f7b2a3ca68afb4e87b77fe700))
- **frontend:** reconcile shadcn v2 integration checks ([ff83a34](https://github.com/nmime/nest-react-boilerplate/commit/ff83a3411dc33e115a178af1c6c1454c2afbc2c4))
- **frontend:** restore auth clients and React test runtime ([289ca71](https://github.com/nmime/nest-react-boilerplate/commit/289ca712459c8e997e0c55d40367ece4e6035570))
- **frontend:** route landing API docs CTA ([#86](https://github.com/nmime/nest-react-boilerplate/issues/86)) ([b5d5b78](https://github.com/nmime/nest-react-boilerplate/commit/b5d5b78e3b73efa5845071d288797bb17cd558eb))
- **frontend:** satisfy api support lint ([14e65b8](https://github.com/nmime/nest-react-boilerplate/commit/14e65b8433827cbd6c3d594da3f6d4a2fa9f2cae))
- **frontend:** satisfy FSD checker lint ([b540a6d](https://github.com/nmime/nest-react-boilerplate/commit/b540a6ddba8a2cf588e1143e581695967e21e133))
- **frontend:** translate merged route polish labels ([749e706](https://github.com/nmime/nest-react-boilerplate/commit/749e7069c90b98878d56e47696ad36a45e64a008))
- **health:** add backend app health config files ([f3f7355](https://github.com/nmime/nest-react-boilerplate/commit/f3f7355a30e6ba7e7f84796da6900a0efa095af2))
- **health:** normalize Telegram username mentions ([612c9b9](https://github.com/nmime/nest-react-boilerplate/commit/612c9b98cd234dd39f1d7b72ce0b4a45ad876f37))
- **helm:** keep backend secrets off frontend pods ([#82](https://github.com/nmime/nest-react-boilerplate/issues/82)) ([4e57378](https://github.com/nmime/nest-react-boilerplate/commit/4e573780800ffe1a2e919bcf7c3643284c5fd09a))
- **i18n:** document root catalog boundary exception ([4ae46ed](https://github.com/nmime/nest-react-boilerplate/commit/4ae46eddd195bc8e8585f964f89a868e9c6932aa))
- **i18n:** load translations from json catalogs ([c0f9109](https://github.com/nmime/nest-react-boilerplate/commit/c0f910976a4926a5da56c2465b082ebc7a2d1726))
- ignore untrusted forwarded IP headers ([cd5632e](https://github.com/nmime/nest-react-boilerplate/commit/cd5632e7128637a330a374a967424cb7b8823a83))
- infra audit findings (network policy, startup probe, HPA, PDB, migration TTL, backups, OTEL, resources, cosign, ssl-redirect) ([e776728](https://github.com/nmime/nest-react-boilerplate/commit/e776728648642a6c29a9b4d0ec8bbeadafbd1bc1))
- integrate strict FSD and full-audit hardening ([4fbbda3](https://github.com/nmime/nest-react-boilerplate/commit/4fbbda32ec2d5dc73036304de2729ead0cb173ba))
- keep Docker JWT default production-safe ([#83](https://github.com/nmime/nest-react-boilerplate/issues/83)) ([6d03718](https://github.com/nmime/nest-react-boilerplate/commit/6d0371874b528393a3626323e633d138d17fe675))
- **lint:** resolve affected backend type diagnostics ([2a60923](https://github.com/nmime/nest-react-boilerplate/commit/2a609235fb5cb1c6633f0d52f38b58f5cd17b8a6))
- **lint:** resolve unbound-method error in auth-token-cleanup.service.spec.ts ([fbf2c89](https://github.com/nmime/nest-react-boilerplate/commit/fbf2c897378e89c559bc23d4f812a98fb6f14c06))
- localize product shell fallback labels ([#74](https://github.com/nmime/nest-react-boilerplate/issues/74)) ([2f9a8b2](https://github.com/nmime/nest-react-boilerplate/commit/2f9a8b2f1b855e3d8a2df16e2d4239e15ce63f44))
- make API contract temp formatting deterministic ([d8247e4](https://github.com/nmime/nest-react-boilerplate/commit/d8247e45c9d24871155ba791693d9075d7863278))
- normalize admin frontend routing under /admin ([#69](https://github.com/nmime/nest-react-boilerplate/issues/69)) ([77068df](https://github.com/nmime/nest-react-boilerplate/commit/77068df10ba977a4e48fdd84e62087bb83a17542))
- **postgres:** clear final lint blockers ([cfd955f](https://github.com/nmime/nest-react-boilerplate/commit/cfd955f09707477f6122c77984cb7363e6f6e2a2))
- **postgres:** validate database env parsing ([25d895a](https://github.com/nmime/nest-react-boilerplate/commit/25d895a2ecade82e1a42b2ec55429203b21f4591))
- preserve admin SPA routes in Helm nginx config ([c2b2e85](https://github.com/nmime/nest-react-boilerplate/commit/c2b2e85f8154fc5bcdfa51562973e7789860dbe9))
- preserve admin SPA routes in nginx ([#73](https://github.com/nmime/nest-react-boilerplate/issues/73)) ([bfc8b63](https://github.com/nmime/nest-react-boilerplate/commit/bfc8b63e2b41164d83598eb0cbb63dd9b1912e8d))
- preserve admin SPA routes with exact nginx matches ([b10236a](https://github.com/nmime/nest-react-boilerplate/commit/b10236a4969c2d183560c224d3485e0956d6ab93))
- **redis:** add ioredis type shim for @grammyjs/storage-redis compatibility ([6716e5a](https://github.com/nmime/nest-react-boilerplate/commit/6716e5a7cdab650822954a63e06f470bfdb462c5))
- repo cleanup (CHANGELOG, SECURITY.md, issue templates, migration scaffold) ([1fee122](https://github.com/nmime/nest-react-boilerplate/commit/1fee122b58947752a9b3673ecd452a4c9cd45874))
- **security:** bump happy-dom override to 20.8.9 (GHSA-w4gp-fjgq-3q4g) ([c46b5c2](https://github.com/nmime/nest-react-boilerplate/commit/c46b5c2f42eeb31c44a3fc14f2f5c5357e0ec275))
- **security:** constrain default development API CORS origins ([#71](https://github.com/nmime/nest-react-boilerplate/issues/71)) ([4110310](https://github.com/nmime/nest-react-boilerplate/commit/41103102f7229ed9c9a3c4b78f040b0507aa3003))
- **security:** harden frontend container runtime ([#75](https://github.com/nmime/nest-react-boilerplate/issues/75)) ([aefc7b4](https://github.com/nmime/nest-react-boilerplate/commit/aefc7b43cc73f45537b0943901a7e6c860a0bf7c))
- **swagger:** name session cookie security scheme ([ce4a773](https://github.com/nmime/nest-react-boilerplate/commit/ce4a773f331fd59e6639b5df76dc5b562374ee81))
- tag api client as shared FSD layer ([#175](https://github.com/nmime/nest-react-boilerplate/issues/175)) ([9fd26ff](https://github.com/nmime/nest-react-boilerplate/commit/9fd26ffef07ed7bc188eac8aebf8b4e23dcc44d5))
- **test:** fix deterministic-clock ESM require and negative time advance ([5c85b7c](https://github.com/nmime/nest-react-boilerplate/commit/5c85b7c1f6842a6a49c34d87bcb599f35e3ea1eb))
- **testing:** make mobile and site suites React 19 compatible ([4a445d5](https://github.com/nmime/nest-react-boilerplate/commit/4a445d56c79a8ce9b19baa1722c2e00dde5249a5))
- **test:** make workspace suites deterministic under test mode ([ec694d7](https://github.com/nmime/nest-react-boilerplate/commit/ec694d70fd43b8ea1e7091a8dd51bee2b9aeaac1))
- **tests:** add env vars to discord-app-api module spec ([c348632](https://github.com/nmime/nest-react-boilerplate/commit/c348632e15c3e416f3479e8c0e649a451aa9aad7))
- tooling static-check loader, naming conventions, and stale denylist ([4c672cc](https://github.com/nmime/nest-react-boilerplate/commit/4c672ccf212d3b1e501034f0f0e52007a27f5a88))
- **tooling:** add frontend tsconfig lib dom/es2022 and fix vite/vitest paths ([2e9dd58](https://github.com/nmime/nest-react-boilerplate/commit/2e9dd5830057c49b8cfbaa9ae4ed48c987a00e2d))
- **tooling:** address all spec review failures ([1426788](https://github.com/nmime/nest-react-boilerplate/commit/14267882d42b439776de084fdbc5b1a4a41ca8bb))
- **tooling:** complete localAction regex in workflow validator ([a8e358b](https://github.com/nmime/nest-react-boilerplate/commit/a8e358bf4f9a2c1b41c2edca9b78fd8f9a21528b))
- **tooling:** correct all generated paths and constant naming conventions ([4bca232](https://github.com/nmime/nest-react-boilerplate/commit/4bca232b8c864af1740dc6f63e17a48b7ffcc33b))
- **tooling:** frontend app vite root and frontend lib build target ([b671e31](https://github.com/nmime/nest-react-boilerplate/commit/b671e31a8caadf74b92f9745c0563fb0103de7bb))
- **tooling:** harden operation paths, validate selection, remove unsafe casts ([278821a](https://github.com/nmime/nest-react-boilerplate/commit/278821adefecc36c548a908c60196f5afa11952c))
- **tooling:** make setup and generator lint authoritative ([534f194](https://github.com/nmime/nest-react-boilerplate/commit/534f19458b45fae39160357ff3e2c85987e80efe))
- **tooling:** make static checks self-contained ([70603ab](https://github.com/nmime/nest-react-boilerplate/commit/70603abe21d1732cad3992460ca4ac6639c553f1))
- **tooling:** match backend app conventions for lint/typecheck compliance ([8ca9df1](https://github.com/nmime/nest-react-boilerplate/commit/8ca9df1bdfc94ac5eea52d26746408db3fa2653d))
- **tooling:** match exact repo conventions across all generators ([5f04f9d](https://github.com/nmime/nest-react-boilerplate/commit/5f04f9d247bca296bafb117f3a2190061c32dfc2))
- **tooling:** migration spec uses addSql mock pattern like existing feature-flags ([96fcad0](https://github.com/nmime/nest-react-boilerplate/commit/96fcad0cf81b37d68074848f69b02a86f1adbe76))
- **tooling:** preserve PATH for QA shell checks ([e12227c](https://github.com/nmime/nest-react-boilerplate/commit/e12227cf286c837b86202c4b47ed6a382d839734))
- **tooling:** vitest include tsx + shared/postgres specs for test coverage ([5f820d1](https://github.com/nmime/nest-react-boilerplate/commit/5f820d1b96c754f2a7344605eb8c325e21064063))
- version triad (Node 24), remove stale deploy/argocd, add missing config files, update SECURITY.md, CONTRIBUTING.md ([e7cfdf4](https://github.com/nmime/nest-react-boilerplate/commit/e7cfdf416ec9b93a5500362a7d55575ab27f00a4))
- Vitest 4 compatibility (InlineConfig→UserConfig) and Vite deprecation fixes ([3f4514e](https://github.com/nmime/nest-react-boilerplate/commit/3f4514e9c177b68f977c2839b9c568f1f584e91b))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).
Version bumps, changelog entries, and git tags are automated by semantic-release via Conventional Commits.

## [Unreleased]

### Added

- Explicit, repeatable application selection with reference frontend/API/E2E surfaces, optional Telegram and Discord APIs, and dependency-safe reruns.
- Product initialization now rewrites tracked `.env*.example` domain templates while leaving real `.env` files untouched.
- Database migration verification now allows cold Docker startup during the full repository test matrix.

### Changed

- Updated `@types/supertest` to 7.2.1 after a registry and peer-compatibility audit; newer incompatible runtime/compiler majors remain documented and intentionally deferred.
- Standardized public hostnames with `landing-app` on the apex domain and every other deployable on `<app-id>.<root-domain>`; for example, `auth-app-api.example.com` maps directly to `auth-app-api`.
- Stabilized Node.js 24 tooling tests by isolating Docker migration coverage and running process-output setup tests in-process.

### Fixed

- Docker Node.js version corrected (26 → 24.11.0)
- Site app Docker stage now uses proper build + runtime (no experimental TS stripping)
- Deploy workflow now gated on CI success via `workflow_run` trigger
- CodeQL now uses explicit pnpm build steps instead of `autobuild`
- Added missing NetworkPolicy Helm template (production network segmentation)
- Added startupProbe to all deployments
- HPA scale-down stabilization window (300s)
- PDB changed to `maxUnavailable: 1`
- Migration job TTL for pod cleanup
- Frontend services now have resource limits in production
- Backups enabled in production
- OTEL traces exported to OTLP (Tempo) instead of debug-only
- Cosign `COSIGN_EXPERIMENTAL` removed (deprecated for v4+)
- SSL redirect annotation added to ingress
- Added `.prettierrc` configuration
- Line ending normalization via `.gitattributes`
- Dockerfile excludes docs, .github, .cursor, markdown files

### Added

- Full GitOps CI/CD pipeline with ArgoCD Application
- `deploy/k8s/argocd-application.yaml` — ArgoCD app with auto-sync, prune, selfHeal
- `deploy/k8s/values.yaml` — LIVE production values managed by deploy workflow
- `.github/workflows/deploy.yml` — CI-gated deployment workflow
- `.github/workflows/argo-sync.yml` — manual ArgoCD force-sync
- `scripts/update-deploy-tags.py` — image tag updater with SHA validation + dry-run
- `GITOPS.md` — comprehensive GitOps documentation
- 1,139-line production deployment runbook in ansible-k8s-full-setup
- Dependabot assignees and reviewers configured

### Removed

- `roles/brocoders-boilerplate-setup/` from ansible-k8s-full-setup
- All brocoders references from platform documentation

## [0.1.0] - 2025-07-01

### Added

- Initial release of NestJS + React boilerplate
- Nx monorepo with 41 projects (6 backend apps, 3 frontend apps, 27+ libs)
- Full authentication system (JWT, refresh tokens, Telegram, Discord OAuth)
- Multi-stage Docker builds with SBOM, Trivy scanning, Cosign signing
- Helm chart with production-ready values
- Comprehensive CI/CD: CI gate, CodeQL, Scorecard, dependency review
- Quality presets: a11y, performance, DAST, chaos, load testing, canary
- 297 test files with Vitest + Playwright
- Testcontainers-based integration testing
- Feature-sliced architecture (FSD) for frontend
- OpenAPI contract management with Spectral linting and fuzzing
