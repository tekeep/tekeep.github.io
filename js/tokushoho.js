// お問い合わせフォームへのリンクをクリックした際に、親ウィンドウにメッセージを送信
document.getElementById('openContactFormLink').addEventListener('click', (e) => {
    e.preventDefault();
    window.parent.postMessage({ type: 'openContactModal' }, '*');
});

// コンテンツの高さを計算して親ウィンドウに送信する
function sendHeight() {
    requestAnimationFrame(() => {
        const height = document.body.scrollHeight;
        window.parent.postMessage({ type: 'resize', height: height, source: 'tokushoho' }, '*');
    });
}

// ページ読み込み時、ウィンドウリサイズ時に高さを送信
window.addEventListener('load', sendHeight);
window.addEventListener('resize', sendHeight);

// コンテンツの動的な変更を監視して高さを再送信
const observer = new MutationObserver(sendHeight);
observer.observe(document.body, { childList: true, subtree: true, attributes: true });