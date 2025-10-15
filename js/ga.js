/**
 * =================================================
 * Google Analytics ダミー関数定義
 * =================================================
 * gtag関数が未定義の場合にエラーが発生するのを防ぎます。
 * 実際のGA読み込みは、config.jsの設定に基づき各ページのメインJSで行われます。
 */
if (typeof window.gtag !== 'function') {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function() { dataLayer.push(arguments); };
}