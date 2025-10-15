document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const currentPlan = urlParams.get('plan') || 'free';

    // プランの階層を定義 (free: 0, standard: 1, pro: 2)
    const planHierarchy = { 'free': 0, 'standard': 1, 'pro': 2 };
    const currentPlanLevel = planHierarchy[currentPlan];

    const planElements = {
        'free': { card: document.querySelector('.pricing-card:nth-child(1)'), level: 0 },
        'standard': { card: document.querySelector('.pricing-card:nth-child(2)'), level: 1 },
        'pro': { card: document.querySelector('.pricing-card:nth-child(3)'), level: 2 }
    };

    for (const [planName, element] of Object.entries(planElements)) {
        const button = element.card.querySelector('.button');
        if (!button) continue;

        if (element.level === currentPlanLevel) {
            // --- 同じプランの場合 ---
            button.textContent = '現在利用中です';
            button.className = 'button current';
            button.disabled = true;
        } else if (element.level > currentPlanLevel) {
            // --- 上位プランの場合 ---
            button.textContent = 'このプランにする';
            button.className = 'button upgrade';
            button.disabled = false;
            button.dataset.plan = planName; // postMessageで送るためのプラン名をセット
        } else {
            // --- 下位プランの場合（ダウングレード不可） ---
            button.textContent = '選択できません';
            button.className = 'button disabled';
            button.disabled = true;
        }
    }
});

// コンテンツの高さを計算して親ウィンドウに送信する
function sendHeight() {
    const height = document.body.scrollHeight;
    window.parent.postMessage({ type: 'resize', height: height, source: 'pricing' }, '*');
}
// ページ読み込み時とウィンドウリサイズ時に高さを送信
window.onload = sendHeight;
window.onresize = sendHeight;

// 購入ボタンのクリックイベント
document.querySelector('.pricing-container').addEventListener('click', async (e) => {
    if (e.target.classList.contains('upgrade')) {
        const plan = e.target.dataset.plan;
        const button = e.target;
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 準備中...';

        try {
            // 親ウィンドウに決済開始イベントを通知
            window.parent.postMessage({ type: 'startPayment', plan: plan }, '*');

            // 親ウィンドウに決済セッションの作成を依頼
            window.parent.postMessage({ type: 'createCheckoutSession', plan: plan }, '*');
        } catch (error) {
            console.error('Checkout session creation failed:', error);
            button.disabled = false;
            button.textContent = 'このプランにする';
        }
    }
});

// 親ウィンドウからのエラー通知を受け取る
window.addEventListener('message', (event) => {
    if (event.data && (event.data.type === 'checkoutSessionFailed' || event.data.type === 'checkoutSessionClosed')) {
        const button = document.querySelector('.button.upgrade[disabled]');
        if (button) {
            button.disabled = false;
            button.textContent = 'このプランにする';
        }
    }
});