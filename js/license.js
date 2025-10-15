const authForm = document.getElementById('auth-form');
const authInfoUI = document.getElementById('auth-info');
const deviceManagementUI = document.getElementById('device-management');
const messageArea = document.getElementById('message-area');
const authFormDescription = authForm.querySelector('p');
const copyKeyBtn = document.getElementById('copyKeyBtn');
const backToAuthInfoContainer = document.getElementById('backToAuthInfoContainer');
const licenseKeyInput = document.getElementById('licenseKeyInput');
const submitBtn = document.getElementById('submitLicenseKey');
const deviceList = document.getElementById('device-list');
let currentLicenseKey = '';
let currentDeviceId = '';
const APP_NAME = "TeKeep!"; // このアプリケーションの名前を定義

/**
 * ================= UI制御 =================
 */
function showMessage(text, type) {
    messageArea.textContent = text;
    messageArea.className = `message-area ${type}`;
    messageArea.style.display = 'block';
}

function showDeviceManagementUI(devices) {
    authForm.style.display = 'none';
    authInfoUI.style.display = 'none';
    deviceManagementUI.style.display = 'block';
    deviceList.innerHTML = '';

    currentDeviceId = new URLSearchParams(window.location.search).get('deviceId');

    devices.forEach(device => {
        const li = document.createElement('li');
        li.className = 'device-item';
        const isCurrent = device.id === currentDeviceId;
        li.innerHTML = `
            <span class="device-id"><i class="fa-solid fa-desktop" style="margin-right: 8px;"></i>${device.name} ${isCurrent ? '<span class="current-device-label">(このデバイス)</span>' : ''}</span>
            <button class="remove-device-btn" data-device-id="${device.id}">解除</button>
        `;
        deviceList.appendChild(li);
    });
    sendHeight();
}

function showAuthForm() {
    deviceManagementUI.style.display = 'none';
    authInfoUI.style.display = 'none';
    authForm.style.display = 'block';
    messageArea.style.display = 'none';
    authFormDescription.textContent = 'ライセンスキーをお持ちの場合は、以下に入力して認証してください。';
    backToAuthInfoContainer.style.display = 'none';
    // デバイス名入力欄は、過去の認証情報がない場合にのみクリアする
    sendHeight();
}

/**
 * ライセンスキーを伏せ字にする
 * @param {string} key - ライセンスキー
 * @returns {string} 伏せ字化されたライセンスキー
 */
function maskLicenseKey(key) {
    if (!key) return 'N/A';
    const parts = key.split('-');
    if (parts.length > 1) { // ハイフン区切りの場合 (例: ABCD-EFGH-IJKL-MNOP)
        // 先頭と末尾のブロックを表示し、中間を伏せ字にする
        return parts.map((part, index) => {
            if (index === 0 || index === parts.length - 1) {
                return part;
            }
            return '*'.repeat(part.length);
        }).join('-');
    } else { // ハイフンがない場合
        return key.length > 8 ? key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4) : key;
    }
}

/** プランの内部名から表示名を取得する */
function getPlanDisplayName(planName) {
    const names = { 'free': 'フリー プラン', 'standard': 'スタンダード プラン', 'pro': 'プロ プラン' };
    return names[planName] || `${planName} プラン`;
}

/**
 * ================= イベントリスナー =================
 */
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const licenseKey = urlParams.get('key');
    const licensePlan = urlParams.get('plan');
    const expiresAt = urlParams.get('expiresAt');
    currentDeviceId = urlParams.get('deviceId');

    if (licenseKey && licensePlan && licenseKey !== 'null' && licensePlan !== 'null') {
        // 認証済みの場合のUIを表示
        authForm.style.display = 'none';
        authInfoUI.style.display = 'block';
        document.getElementById('current-plan').textContent = getPlanDisplayName(licensePlan);
        document.getElementById('current-license-key').textContent = maskLicenseKey(licenseKey);
        document.getElementById('current-expires-at').textContent = formatExpiresAt(expiresAt);
        loadAndRenderDevices(licenseKey); // 認証済みデバイスリストを読み込み

        // コピーボタンのイベントリスナーを設定
        if (copyKeyBtn) {
            copyKeyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(licenseKey).then(() => {
                    const originalText = copyKeyBtn.innerHTML;
                    copyKeyBtn.innerHTML = '<i class="fa-solid fa-check"></i>コピー完了';
                    setTimeout(() => {
                        copyKeyBtn.innerHTML = originalText;
                    }, 2000);
                });
            });
        }
    } else {
        // 未認証の場合のUIを表示
        showAuthForm();
    }
    sendHeight();
});

/**
 * 有効期限の日付文字列をフォーマットする
 * @param {string} expiresAtStr - ISO 8601形式の日付文字列
 * @returns {string} フォーマットされた日付文字列
 */
function formatExpiresAt(expiresAtStr) {
    if (!expiresAtStr || expiresAtStr === 'null') return 'N/A';
    // DBには「有効期限の翌日0時」が保存されているため、表示上は1日引く
    const expiresDate = new Date(expiresAtStr);
    expiresDate.setDate(expiresDate.getDate() - 1);

    const year = expiresDate.getFullYear();
    const month = expiresDate.getMonth() + 1;
    const date = expiresDate.getDate();
    return `${year}年${month}月${date}日 23:59 まで`;
}

document.getElementById('openPricingLink').addEventListener('click', (e) => {
    e.preventDefault();
    window.parent.postMessage('openPricingModalFromLicense', '*');
});

document.getElementById('showUpgradeFormLink').addEventListener('click', (e) => {
    e.preventDefault();
    authInfoUI.style.display = 'none';
    authForm.style.display = 'block';
    authFormDescription.textContent = '新しいライセンスキーを入力してプランをアップグレードしてください。';
    backToAuthInfoContainer.style.display = 'block';
    messageArea.style.display = 'none';
    sendHeight();
});

document.getElementById('backToAuthInfoLink').addEventListener('click', (e) => {
    e.preventDefault();
    authForm.style.display = 'none';
    authInfoUI.style.display = 'block';
    messageArea.style.display = 'none';
    sendHeight();
});

submitBtn.addEventListener('click', async () => {
    const key = licenseKeyInput.value.trim();
    if (!key) { showMessage('ライセンスキーを入力してください。', 'error'); return; }

    const deviceName = document.getElementById('deviceNameInput').value.trim();
    if (!deviceName) {
        showMessage('デバイス名を入力してください。', 'error');
        return;
    }
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 認証中...';
    messageArea.style.display = 'none';

    try {
        const deviceId = currentDeviceId;
        const currentPlan = new URLSearchParams(window.location.search).get('plan') || 'free';
 
        // 親ウィンドウにEdge Functionの実行を依頼
        const requestType = 'invoke:authenticate-license';
        window.parent.postMessage({ type: requestType, body: { appName: APP_NAME, licenseKey: key, deviceId: deviceId, deviceName: deviceName, currentPlan: currentPlan } }, '*');

        // 親ウィンドウからの結果を待つ
        const responseType = 'response:authenticate-license';
        const response = await new Promise(resolve => {
            const listener = (event) => {
                if (event.data && event.data.type === responseType) {
                    window.removeEventListener('message', listener);
                    resolve(event.data.response);
                }
            };
            window.addEventListener('message', listener);
        });

        // Edge Functionが正常にエラーを返した場合
        if (response.status === 'success') {
            window.parent.postMessage({ type: 'authSuccess', key: response.key, plan: response.plan, expiresAt: response.expiresAt }, '*');
            currentLicenseKey = response.key; // 認証成功時に最新のキーを内部変数に保持
            // UIを認証済み画面に切り替え、成功メッセージを表示
            authForm.style.display = 'none';
            authInfoUI.style.display = 'block';
            document.getElementById('current-plan').textContent = getPlanDisplayName(response.plan);
            document.getElementById('current-license-key').textContent = maskLicenseKey(response.key);
            document.getElementById('current-expires-at').textContent = formatExpiresAt(response.expiresAt);
            loadAndRenderDevices(response.key); // 認証成功後にもデバイスリストを更新
            showMessage('ライセンス認証に成功しました。', 'success');
            sendHeight(); // 高さを再計算
        } else if (response.status === 'device_limit_exceeded') {
            currentLicenseKey = key;
            showMessage(response.message, 'error');
            showDeviceManagementUI(response.devices);
        } else {
            // 'error' ステータスやその他の予期せぬステータス
            showMessage(response.message || '認証に失敗しました。', 'error');
        }
    } catch (error) {
        console.error('認証処理中にエラーが発生しました:', error);
        showMessage('サーバーとの通信に失敗しました。時間をおいて再度お試しください。', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '認証する';
        sendHeight();
    }
});

deviceList.addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('.remove-device-btn');
    if (removeBtn) {
        if (!confirm('このデバイスの登録を解除します。よろしいですか？')) return;

        const btn = removeBtn;
        const deviceIdToRemove = removeBtn.dataset.deviceId;
        const key = currentLicenseKey;

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        try {
            // 親ウィンドウにEdge Functionの実行を依頼
            const requestType = 'invoke:remove-device';
            window.parent.postMessage({ type: requestType, body: { appName: APP_NAME, licenseKey: key, deviceIdToRemove: deviceIdToRemove } }, '*');

            // 親ウィンドウからの結果を待つ
            const responseType = 'response:remove-device';
            const response = await new Promise(resolve => {
                const listener = (event) => {
                    if (event.data && event.data.type === responseType) {
                        window.removeEventListener('message', listener);
                        resolve(event.data.response);
                    }
                };
                window.addEventListener('message', listener);
            });
            if (response.status === 'success') {
                // メッセージを更新して、ユーザーに次のアクションを促す
                document.getElementById('device-limit-message-1').textContent = 'デバイスを解除しました。';
                document.getElementById('device-limit-message-2').textContent = '「認証画面に戻る」ボタンを押して、再度このデバイスの登録をお試しください。';
                const itemToRemove = btn.closest('.device-item');
                if (itemToRemove) itemToRemove.remove();
                showMessage(response.message, 'success');
            } else {
                showMessage(response.message || 'デバイスの解除に失敗しました。', 'error');
            }
        } catch (error) {
            console.error('デバイス解除処理中にエラーが発生しました:', error);
            showMessage('サーバーとの通信に失敗しました。時間をおいて再度お試しください。', 'error');
        } finally {
            // 成功・失敗に関わらず、ボタンの状態を元に戻す
            btn.disabled = false;
            btn.innerHTML = '解除';
        }
    }
});

document.getElementById('revokeLicenseBtn').addEventListener('click', async () => {
    if (!confirm('このデバイスの登録を解除します。よろしいですか？')) return;

    const urlParams = new URLSearchParams(window.location.search);
    const key = urlParams.get('key'); // 認証解除は常に表示中のキーで行う
    const deviceIdToRemove = urlParams.get('deviceId');
    if (!key || !deviceIdToRemove) return;

    const btn = document.getElementById('revokeLicenseBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 解除中...';

    try {
        // 親ウィンドウにEdge Functionの実行を依頼
        const requestType = 'invoke:remove-device';
        window.parent.postMessage({ type: requestType, body: { appName: APP_NAME, licenseKey: key, deviceIdToRemove: deviceIdToRemove } }, '*');

        // 親ウィンドウからの結果を待つ
        const responseType = 'response:remove-device';
        const response = await new Promise(resolve => {
            const listener = (event) => {
                if (event.data && event.data.type === responseType) {
                    window.removeEventListener('message', listener);
                    resolve(event.data.response);
                }
            };
            window.addEventListener('message', listener);
        });
        if (response.status === 'success') {
            // 親ウィンドウに認証解除を通知
            window.parent.postMessage({ type: 'authRevoke', message: response.message }, '*');
            // UIを未認証フォームに切り替え、成功メッセージを表示
            showAuthForm();
            showMessage('ライセンスの認証を解除しました。', 'success');
        } else {
            showMessage(response.message || '解除に失敗しました。', 'error');
        }
    } catch (error) {
        showMessage('サーバーとの通信に失敗しました。', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '認証を解除する';
        sendHeight();
    }
});

document.getElementById('backToAuthFormBtn').addEventListener('click', showAuthForm);

/**
 * 認証済みデバイスのリストを読み込んで描画する
 * @param {string} licenseKey - ライセンスキー
 */
async function loadAndRenderDevices(licenseKey) {
    const listEl = document.getElementById('current-device-list');
    if (!listEl) return;
    listEl.innerHTML = '<li><i class="fa-solid fa-spinner fa-spin"></i> デバイス情報を読み込み中...</li>';

    try {
        // authenticate-licenseを流用してデバイスリストを取得
        const requestType = 'invoke:authenticate-license';
        window.parent.postMessage({ type: requestType, body: { appName: APP_NAME, licenseKey: licenseKey, deviceId: 'dummy', deviceName: 'dummy', currentPlan: 'free' } }, '*');

        const responseType = 'response:authenticate-license';
        const response = await new Promise(resolve => {
            const listener = (event) => {
                if (event.data && event.data.type === responseType) {
                    window.removeEventListener('message', listener);
                    resolve(event.data.response);
                }
            };
            window.addEventListener('message', listener);
        });

        if (response.devices) {
            listEl.innerHTML = '';
            response.devices.forEach(device => {
                const isCurrent = device.id === currentDeviceId;
                const li = document.createElement('li');
                li.className = 'device-item';
                li.innerHTML = `
                    <div style="flex-grow: 1;"> <!-- このdivが名前とフォームのコンテナになる -->
                        <div class="device-name-display">
                            <span class="device-name-text">${device.name}</span> ${isCurrent ? '<span class="current-device-label">(このデバイス)</span>' : ''}
                        </div>
                        <form class="device-name-edit-form">
                            <input type="text" value="${device.name}" class="device-name-input" placeholder="例: 自宅のPC, 通勤用のスマホ" required><button type="submit" class="save-device-name-btn" data-device-id="${device.id}">保存</button></form>
                    </div>
                    <button class="edit-device-btn" data-device-id="${device.id}" title="デバイス名を編集します"><i class="fa-solid fa-pencil" style="margin-right: 4px;"></i>編集</button>
                `;
                listEl.appendChild(li);
            });
        } else {
            listEl.innerHTML = '<li>デバイス情報がありません。</li>';
        }
    } catch (e) {
        listEl.innerHTML = '<li>デバイス情報の読み込みに失敗しました。</li>';
    } finally {
        sendHeight();
    }
}

// デバイスリストのイベント委譲
document.getElementById('current-device-list').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-device-btn');
    const saveBtn = e.target.closest('.save-device-name-btn');
    const item = e.target.closest('.device-item');
    if (!item) return;

    // 「編集」ボタンの処理
    if (editBtn) {
        item.querySelector('.device-name-display').style.display = 'none';
        item.querySelector('.device-name-edit-form').style.display = 'flex';
        editBtn.style.display = 'none'; // 編集ボタンを隠す
        sendHeight();
    }

    // 「保存」ボタンの処理
    if (saveBtn) {
        e.preventDefault();
        const deviceId = saveBtn.dataset.deviceId;
        const newDeviceName = item.querySelector('.device-name-input').value.trim();
        const licenseKey = new URLSearchParams(window.location.search).get('key');

        if (!newDeviceName) { alert('デバイス名を入力してください。'); return; }

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        // 親ウィンドウにEdge Functionの実行を依頼
        const requestType = 'invoke:update-device-name';
        window.parent.postMessage({ type: requestType, body: { appName: APP_NAME, licenseKey, deviceId, newDeviceName } }, '*');

        const responseType = 'response:update-device-name';
        const response = await new Promise(resolve => {
            const listener = (event) => {
                if (event.data && event.data.type === responseType) { window.removeEventListener('message', listener); resolve(event.data.response); }
            };
            window.addEventListener('message', listener);
        });

        if (response.status === 'success') {
            await loadAndRenderDevices(licenseKey); // 成功したらリストを再読み込み
        } else {
            alert(response.message || '更新に失敗しました。');
            saveBtn.disabled = false;
            saveBtn.innerHTML = '保存';
        }
    }
});

// 親ウィンドウに高さを送信
function sendHeight() {
    // requestAnimationFrameを使用して、ブラウザの描画更新後に高さを取得する
    requestAnimationFrame(() => {
        const height = document.body.scrollHeight;
        window.parent.postMessage({ type: 'resize', height, source: 'license' }, '*');
    });
}

// ページ読み込み時、ウィンドウリサイズ時に高さを送信
window.addEventListener('load', sendHeight);
window.addEventListener('resize', sendHeight);

const observer = new MutationObserver(sendHeight);
observer.observe(document.body, { childList: true, subtree: true, attributes: true });