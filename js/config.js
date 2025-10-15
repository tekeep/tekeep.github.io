/**
 * =================================================
 * アプリケーション設定ファイル
 * =================================================
 * 環境ごとの設定値を一元管理します。
 * 本番環境へリリースする際は、下の `environment` の値を 'production' に変更してください。
 */

// 'development' または 'production' を指定
const environment = 'production';

const environments = {
  // 本番環境
  production: {
    supabaseUrl: 'https://lfnzlvjgiakifuhtdtal.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbnpsdmpnaWFraWZ1aHRkdGFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4MDk4ODEsImV4cCI6MjA3NDM4NTg4MX0.-qySXufnh3II4xrX5ZZm-Ihd6D3s2u6Sek8ucGJuUuU',
    stripePublishableKey: 'pk_live_51SDqa53xBJ7PSSdCznMkk32sIyMmAc7k7ynTI87dZyQdsb5pOt8f24wxqObKCXhASx5i6pIBSNvVeuf9BuSFHdJZ00YGa8r4x5',
    gasUrl: 'https://script.google.com/macros/s/AKfycbzBFSnlmmHSIYVarB28iuylOidj88GstCitZVbWVK4WdIrAm0dsk59em-qDc5--_9fN/exec',
    gaMeasurementId: 'G-Y15FLWQ7X1',
  },
  // 開発環境
  development: {
    supabaseUrl: 'YOUR_DEV_SUPABASE_URL',
    supabaseAnonKey: 'YOUR_DEV_SUPABASE_ANON_KEY',
    stripePublishableKey: 'YOUR_DEV_STRIPE_PUBLISHABLE_KEY',
    gasUrl: 'YOUR_DEV_GAS_URL',
    // 開発環境ではGoogle Analyticsを計測しないため、IDは設定しない
    gaMeasurementId: null,
  }
};

const config = environments[environment];

// configオブジェクトをグローバルスコープで利用可能にする
// (ES Module内で直接利用するため、実際には不要だが、デバッグ等のために残しても良い)
window.APP_CONFIG = config;
window.APP_ENV = environment;