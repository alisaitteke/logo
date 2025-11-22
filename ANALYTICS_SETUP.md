# Analytics Engine Kurulumu - Hızlı Logging

Cloudflare Workers'da `console.log` kullanımı **5-30 saniye gecikme** ile logları gösterir. Analytics Engine kullanarak **< 1 saniye** içinde logları görebilirsiniz.

## Neden Analytics Engine?

- ✅ **Hızlı**: console.log'dan 5-30x daha hızlı (< 1 saniye vs 5-30 saniye)
- ✅ **Real-time'a yakın**: Production'da hızlı debugging için ideal
- ✅ **Structured logging**: JSON formatında loglar
- ✅ **Ücretsiz**: Cloudflare Analytics Engine ücretsiz tier'da mevcut

## Kurulum

### 1. Wrangler.json Kontrolü

**ÖNEMLİ:** Analytics Engine dataset'leri **otomatik oluşturulur**! `wrangler.json`'da tanımlandığında ve ilk kez veri yazıldığında otomatik olarak oluşturulur. Manuel oluşturma gerekmez.

### 2. Wrangler.json Kontrolü

`wrangler.json` dosyasında şu binding zaten eklenmiş olmalı:

```json
"analytics_engine_datasets": [
  {
    "binding": "ANALYTICS",
    "dataset": "logo-logs"
  }
]
```

### 3. Deploy ve İlk Kullanım

```bash
# Worker'ı deploy et
wrangler deploy

# İlk log yazıldığında dataset otomatik oluşturulacak
```

### 4. Kullanım

Artık kodunuzda `logger` kullanabilirsiniz:

```typescript
import { logger } from './lib/logging/fast-logger';

// Env interface'ine ANALYTICS ekleyin
interface Env {
  ANALYTICS?: AnalyticsEngineDataset;
  // ... diğer bindings
}

// Kullanım
logger.info('Logo fetched successfully', { domain: 'example.com' }, env.ANALYTICS);
logger.warn('Rate limit approaching', { apiKey: 'xxx' }, env.ANALYTICS);
logger.error('Failed to fetch logo', error, { domain: 'example.com' }, env.ANALYTICS);
```

## Logları Görüntüleme

### Cloudflare Dashboard

1. Cloudflare Dashboard → Workers & Pages → logo worker
2. Analytics sekmesi → Analytics Engine
3. `logo-logs` dataset'ini seçin
4. Logları gerçek zamanlı olarak görebilirsiniz

### Wrangler CLI

```bash
# Real-time log tailing (console.log için)
wrangler tail

# Analytics Engine logları için dashboard'u kullanın
```

## Mevcut Kod Güncellemeleri

`src/workers/api.ts` dosyasında örnek kullanım eklenmiştir. Diğer dosyalarda da `console.log` yerine `logger` kullanabilirsiniz:

**Önce:**
```typescript
console.error('Failed to fetch logo:', error);
```

**Sonra:**
```typescript
import { logger } from '../lib/logging/fast-logger';

logger.error('Failed to fetch logo', error, { domain }, env.ANALYTICS);
```

## Notlar

- Analytics Engine optional binding olarak tanımlanmıştır (`ANALYTICS?`)
- Eğer Analytics Engine yoksa, otomatik olarak `console.log`'a fallback yapar
- Development'ta her iki yöntem de çalışır (hem Analytics Engine hem console.log)
- Production'da Analytics Engine kullanımı önerilir

## Sorun Giderme

**Loglar görünmüyor:**
1. Worker'ı deploy ettikten sonra en az bir log yazıldığından emin olun (dataset otomatik oluşturulur)
2. Binding'in doğru olduğunu kontrol edin: `wrangler.json`
3. Cloudflare Dashboard'da dataset'in oluşturulduğunu kontrol edin: Workers & Pages → Analytics → Analytics Engine
4. Worker'ı yeniden deploy edin: `wrangler deploy`

**Analytics Engine yazma hatası:**
- Logger otomatik olarak `console.log`'a fallback yapar
- Hata console'da görünecektir: "Analytics Engine write failed"

