# Cloudflare Pages'e Git Bağlama Rehberi

## Yöntem 1: Cloudflare Dashboard (Önerilen)

### Adımlar:

1. **Cloudflare Dashboard'a Git**
   - https://dash.cloudflare.com adresine git
   - Workers & Pages → Create application → Pages → Connect to Git

2. **Git Repository Bağla**
   - GitHub hesabınızı bağlayın (ilk kez ise)
   - Repository seçin: `alisaitteke/logo`
   - Branch: `main`

3. **Build Ayarları**
   - **Framework preset**: Astro
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/` (root)

4. **Environment Variables Ekle**
   - Settings → Environment Variables → Production
   - Şu değişkenleri ekle:
     - `GETLOGO_API_URL`: `https://getlogo.dev`
     - `LOGO_DEV_API_URL`: `https://logo.dev`
     - `CLOUDFLARE_IMAGES_BASE_URL`: `https://imagedelivery.net`
     - `BASE_URL`: `https://logo.alisait.com`
     - `SITE_URL`: `https://logo.alisait.com`

5. **Secrets Ekle**
   - Settings → Environment Variables → Secrets
   - Şu secret'ları ekle:
     - `BREVO_API_KEY`: (mevcut secret'ınız)
     - `BREVO_FROM_EMAIL`: `logo@alisait.com`

6. **Bindings Ekle**
   - Settings → Functions → Bindings
   - **KV Namespaces**:
     - `API_KEYS` → `ff1c40daf92c401b8d459892ea75697d`
     - `STATS` → `fcd0c3ea27a74267b91d55770a5988de`
     - `MAGIC_LINKS` → `e9504e254bdf438892d87bf256ecceda`
   - **R2 Buckets**:
     - `LOGOS` → `logos`
   - **Queues**:
     - `EMAIL_QUEUE` → `email-queue` (Producer ve Consumer)

7. **Custom Domain Ekle**
   - Settings → Custom domains → Add custom domain
   - Domain: `logo.alisait.com`
   - DNS kayıtları otomatik oluşturulacak

8. **Deploy**
   - İlk deploy otomatik başlayacak
   - Her push'ta otomatik deploy olacak

## Yöntem 2: GitHub Actions (CI/CD)

GitHub Actions workflow dosyası `.github/workflows/deploy.yml` olarak hazırlandı.

### Gereksinimler:

1. **GitHub Secrets Ekle**
   - Repository → Settings → Secrets and variables → Actions
   - Şu secret'ları ekle:
     - `CLOUDFLARE_API_TOKEN`: Cloudflare API token'ınız
     - `CLOUDFLARE_ACCOUNT_ID`: `46e091aceaae04e0b865782da10b0491`

2. **Cloudflare API Token Oluştur**
   - Cloudflare Dashboard → My Profile → API Tokens
   - Create Token → Custom token
   - Permissions:
     - Account → Cloudflare Pages → Edit
     - Zone → Zone → Read
   - Account Resources → Include → Specific account → Account ID seç

3. **Workflow Aktif**
   - Her push'ta otomatik deploy olacak
   - Pull request'lerde preview deployment oluşturulacak

## Notlar

- Cloudflare Pages, Workers runtime'ını destekler
- Astro Cloudflare adapter otomatik olarak Pages için optimize edilir
- Queue consumer'lar Pages'de de çalışır
- Custom domain SSL otomatik olarak yapılandırılır

