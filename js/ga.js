/**
 * =================================================
 * Google Analytics 共通初期化モジュール
 * =================================================
 * config.jsの設定（gaMeasurementId）を取得し、自動でGAを初期化します。
 * 本番環境でのみ計測が行われるように一元管理されます。
 */

import configPromise from './config.js';

// gtag のダミー関数を先に定義（初期化前にgtagが呼ばれてもエラーにならないようにする）
if (typeof window.gtag !== 'function') {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
}

configPromise.then(({ APP_CONFIG }) => {
    // 測定IDが設定されていない場合（開発環境など）は読み込まない
    if (!APP_CONFIG.gaMeasurementId) {
        return;
    }

    // 二重初期化を防止
    if (window._gaInitialized) return;
    window._gaInitialized = true;

    // gtag.js を動的に読み込む
    const gtagScript = document.createElement('script');
    gtagScript.async = true;
    gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${APP_CONFIG.gaMeasurementId}`;
    document.head.appendChild(gtagScript);

    // GAの初期化と設定
    window.gtag('js', new Date());
    window.gtag('config', APP_CONFIG.gaMeasurementId);
    
    console.log(`Google Analytics を初期化しました (ID: ${APP_CONFIG.gaMeasurementId})`);
}).catch(err => {
    console.warn('Google Analytics の初期化中にエラーが発生しました:', err);
});