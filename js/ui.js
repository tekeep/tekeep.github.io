/**
 * =================================================
 * 共通UI制御スクリプト
 * =================================================
 * ハンバーガーメニュー、モーダルなど、サイト全体で共通のUIを制御します。
 * このスクリプトは、特定のページロジックに依存せず、単体で動作するように設計されています。
 */

/**
 * モーダルウィンドウのセットアップ
 * @param {string} modalId - モーダル要素のID
 * @param {string} openBtnId - モーダルを開くボタンのID
 */
function setupModal(modalId, openBtnId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const openBtn = document.getElementById(openBtnId);
  const closeBtn = modal.querySelector('.modal-close-btn');

  const openModal = (e) => {
    // 親ウィンドウに、iframeのsrcを更新するよう通知する
    window.parent.postMessage({ type: 'openModal', modalId: modalId }, '*');

    if (e) e.preventDefault();
    if (modalId === 'contactModal') {
        // お問い合わせモーダルの場合、常にiframeを再生成してクリーンな状態にする
        const modalBody = modal.querySelector('.modal-body');
        modalBody.innerHTML = ''; // 古いiframeを削除
        const newIframe = document.createElement('iframe');
        newIframe.id = 'contactIframe';
        newIframe.frameBorder = '0';
        newIframe.marginHeight = '0';
        newIframe.marginWidth = '0';
        const deviceId = localStorage.getItem('deviceId') || 'N/A';
        const formId = '1FAIpQLSdl1Tjp7hJAyCirrE_2LoL_4DWhMw2OyEHLEWBL-_WlC2rYbg';
        const entryId = '1585594458';
        newIframe.src = `https://docs.google.com/forms/d/e/${formId}/viewform?embedded=true&entry.${entryId}=${encodeURIComponent(deviceId)}`;
        modalBody.appendChild(newIframe);
    }
    modal.classList.add('is-visible');
  };

  // windowに関数を公開し、他のモーダルから開けるようにする
  window[`open_${modalId}`] = () => {
    // 他のモーダルが開いていれば閉じる
    document.querySelectorAll('.modal-overlay.is-visible').forEach(m => m.classList.remove('is-visible'));
    openModal();
  };

  // モーダルを閉じる直前に、親ウィンドウに通知する
  const notifyClose = () => {
    // index.js側で、プラン変更があったかどうかのチェックなどに利用する
    window.parent.postMessage({ type: 'closeModal', modalId: modalId }, '*');
  };

  const closeModal = () => {
    modal.classList.remove('is-visible');
    // お問い合わせモーダルを閉じた際にiframeを完全に削除し、beforeunload警告を抑制する
    if (modalId === 'contactModal') {
        const modalBody = modal.querySelector('.modal-body');
        modalBody.innerHTML = '<iframe id="contactIframe" src="about:blank" frameborder="0" marginheight="0" marginwidth="0">読み込んでいます…</iframe>';
    }
    // 決済モーダルを閉じた際の特別な後処理
    if (modalId === 'paymentModal') {
      if (window.stripeCheckout) {
        window.stripeCheckout.destroy();
        window.stripeCheckout = null;
      }
      // pricing.htmlにモーダルが閉じたことを通知し、ボタンの状態をリセットさせる
      const pricingIframe = document.getElementById('pricingIframe')?.contentWindow;
      if (pricingIframe) {
        pricingIframe.postMessage({ type: 'checkoutSessionClosed' }, '*');
      }
    }
    // 閉じる直前に通知
    notifyClose();
  };

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-visible')) closeModal();
  });
}

/**
 * ページ読み込み完了時に共通UIのイベントリスナーを登録する
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- ハンバーガーメニュー ---
    const menuBtn = document.querySelector('.menu-btn');
    if (menuBtn) {
        menuBtn.addEventListener('click', function() {
            this.classList.toggle('is-active');
            document.querySelector('.nav-menu').classList.toggle('is-active');
            // メニュー展開時はシェアボタンを非表示にする
            const shareContainer = document.querySelector('.share-button-container');
            if (shareContainer) {
                shareContainer.classList.toggle('is-hidden', this.classList.contains('is-active'));
            }
        });
    }

    // --- 各モーダルのセットアップ ---
    // 存在しないボタンIDを渡してもエラーにならないので、全ページで共通して呼び出せる
    setupModal('contactModal', 'openContactFooter');
    setupModal('licenseModal', 'openLicenseForm');
    setupModal('pricingModal', 'openPricingModal');
    setupModal('tokushohoModal', 'openTokushohoModal');
    setupModal('paymentModal', null); // 決済モーダルはボタンでは開かない
});

/**
 * iframeからのメッセージ受信 (UI関連のみ)
 */
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'openContactModal') {
        // tokushoho.htmlからお問い合わせモーダルを開く要求
        if (window.open_contactModal) window.open_contactModal();
    }
    if (event.data === 'openPricingModalFromLicense') {
        if (window.open_pricingModal) window.open_pricingModal();
    }
});