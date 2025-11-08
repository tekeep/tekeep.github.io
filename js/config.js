/**
 * =================================================
 * アプリケーション設定ファイル
 * =================================================
 * アプリケーション全体で使用する設定を一元管理します。
 * このファイルは非同期で設定を解決し、最終的な設定オブジェクトをエクスポートします。
 */

// 設定を非同期で解決するための関数
async function resolveConfig() {
  // 現在のホスト名から環境を自動判定する
  const getEnvironment = () => {
    const hostname = window.location.hostname;
    if (hostname === 'tekeep.com' || hostname === 'tekeep.github.io') {
      return 'production';
    }
    return 'development'; // それ以外はすべて開発環境として扱う
  };

  const environment = getEnvironment();

  const environments = {
    production: {
      supabaseUrl: 'https://lfnzlvjgiakifuhtdtal.supabase.co',
      supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbnpsdmpnaWFraWZ1aHRkdGFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4MDk4ODEsImV4cCI6MjA3NDM4NTg4MX0.-qySXufnh3II4xrX5ZZm-Ihd6D3s2u6Sek8ucGJuUuU',
      stripePublishableKey: 'pk_live_51SDqa53xBJ7PSSdCznMkk32sIyMmAc7k7ynTI87dZyQdsb5pOt8f24wxqObKCXhASx5i6pIBSNvVeuf9BuSFHdJZ00YGa8r4x5',
      gasUrl: 'https://script.google.com/macros/s/AKfycbzBFSnlmmHSIYVarB28iuylOidj88GstCitZVbWVK4WdIrAm0dsk59em-qDc5--_9fN/exec',
      gaMeasurementId: 'G-Y15FLWQ7X1',
    },
    development: {
      supabaseUrl: 'YOUR_DEV_SUPABASE_URL',
      supabaseAnonKey: 'YOUR_DEV_SUPABASE_ANON_KEY',
      stripePublishableKey: 'YOUR_DEV_STRIPE_PUBLISHABLE_KEY',
      gasUrl: 'YOUR_DEV_GAS_URL',
      gaMeasurementId: null,
    }
  };

  let config = environments[environment];

  // 開発環境の場合、ローカル設定ファイルで上書きを試みる
  if (environment === 'development') {
    try {
      const localConfigModule = await import('./config.local.js');
      if (localConfigModule.default) {
        config = { ...config, ...localConfigModule.default };
        console.log('ローカル設定ファイル (config.local.js) で設定を上書きしました。');
      }
    } catch (e) {
      console.log('ローカル設定ファイル (config.local.js) は見つかりませんでした。');
    }
  }

  return { APP_CONFIG: config, APP_ENV: environment };
}

// 設定解決のPromiseを作成
const configPromise = resolveConfig();

// Promiseをエクスポートし、他のモジュールがawaitで結果を受け取れるようにする
export default configPromise;