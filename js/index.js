import configPromise from './config.js';
import * as holiday_jp from "https://cdn.jsdelivr.net/npm/@holiday-jp/holiday_jp/+esm";

let config;
let supabase;
let STRIPE_PUBLISHABLE_KEY;
let GAS_URL;

const CACHE_VERSION = "1.0.0"; // キャッシュバージョンの定義をここに集約

/**
 * 認証状態をサーバーと同期する
 * @param {object} supabase - Supabaseクライアントインスタンス
 */
async function syncAuthState(supabase) {
    const licenseKey = localStorage.getItem('licenseKey');
    const deviceId = localStorage.getItem('deviceId');

    // ローカルに認証情報がある場合のみ、サーバーに有効性を問い合わせる
    if (licenseKey && deviceId) {
        try {
            const { data: response, error } = await supabase.functions.invoke('validate-device', {
                body: { appName: "TeKeep!", licenseKey: licenseKey, deviceId: deviceId }
            });

            if (error) throw error;

            // サーバー側でデバイスが無効と判断された場合 (他の端末で解除されたなど)
            if (response.status === 'invalid') {
                console.log('認証が無効化されたため、ローカルの認証情報をクリアします。');
                localStorage.removeItem('licenseKey');
                localStorage.removeItem('licensePlan');
                localStorage.removeItem('licenseExpiresAt');
                location.reload(); // ページをリロードしてUIを未認証状態に更新
            } else if (response.status === 'valid' && response.deviceName === '__NEEDS_NAMING__') {
                // 認証は有効だが、デバイス名が未設定の場合
                console.log('デバイス名が未設定のため、設定を促します。');
                // デバイス名設定モーダルを表示
                const deviceNameModal = document.getElementById('deviceNameModal');
                if (deviceNameModal) deviceNameModal.classList.add('is-visible');
            }
        } catch (e) {
            console.error('認証状態の同期中にエラーが発生しました:', e);
        }
    }
}

/**
 * フォームから入力値を取得し、GASに渡すパラメータオブジェクトを作成する
 */
function getParamsFromForm() {
  const isOneMonthChecked = document.getElementById('includeOneMonthPass').checked;
  const isThreeMonthChecked = document.getElementById('includeThreeMonthPass').checked;
  const isSixMonthChecked = document.getElementById('includeSixMonthPass').checked;

  // --- 休日リストの生成と保存 ---
  // 設計意図: GASへの計算用休日リストと、result.htmlへの表示用休日リストをここで生成し、
  // 表示用はlocalStorageに保存する。
  const { gasHolidays } = generateHolidayLists();

  const params = {
    // deviceIdがなければ新規作成し、localStorageに保存する
    deviceId: (() => {
      let uid = localStorage.getItem('deviceId');
      if (!uid) { uid = 'device_' + Date.now(); localStorage.setItem('deviceId', uid); }
      return uid;
    })(),
    fare: Number(document.getElementById('fare').value),
    monthlyPass: isOneMonthChecked ? Number(document.getElementById('monthlyPass').value) || 0 : 0,
    threeMonthPass: isThreeMonthChecked ? Number(document.getElementById('threeMonthPass').value) || 0 : 0,
    sixMonthPass: isSixMonthChecked ? Number(document.getElementById('sixMonthPass').value) || 0 : 0,
    startDate: document.getElementById('startDate').value,
    durationInMonths: Number(document.getElementById('duration').value),
    holidays: gasHolidays.join(','), // 生成した休日リストをカンマ区切りで渡す
    licenseKey: localStorage.getItem('licenseKey'),
    licensePlan: localStorage.getItem('licensePlan'),
    cacheVersion: CACHE_VERSION, // 一元管理されたバージョンを渡す
  };

  // バリデーション
  if (!(params.fare > 0)) {
    alert('片道運賃を入力してください');
    return null;
  }
  if (!params.startDate) {
    alert('シミュレーション開始日を入力してください');
    return null;
  }
  if (!isOneMonthChecked && !isThreeMonthChecked && !isSixMonthChecked) {
    alert('比較する定期券種別を1つ以上選択してください。');
    return null;
  }
  // 1ヶ月定期はデフォルトONのため、チェックが入っている場合のみバリデーションを行う
  if (document.getElementById('includeOneMonthPass').checked && !(params.monthlyPass > 0)) { alert('1ヶ月定期代を正しく入力してください'); return null; }
  if (isThreeMonthChecked && !(params.threeMonthPass > 0)) { alert('3ヶ月定期代を正しく入力してください'); return null; }
  if (isSixMonthChecked && !(params.sixMonthPass > 0)) { alert('6ヶ月定期代を正しく入力してください'); return null; }

  localStorage.setItem('deviceId', params.deviceId); // デバイスIDを保存
  // 入力値をそのままLocalStorageに保存
  ['fare', 'monthlyPass', 'threeMonthPass', 'sixMonthPass'].forEach(id => localStorage.setItem(id, document.getElementById(id).value));

  localStorage.setItem('startDate', params.startDate);
  localStorage.setItem('durationInMonths', params.durationInMonths);
  // 休日設定の保存
  localStorage.setItem('daySettings', JSON.stringify(getDaySettings()));
  localStorage.setItem('includeHolidays', document.getElementById('includeHolidays').checked);
  // getParamsFromFormではカスタム休日の保存は行わない。責務はhandleCalendarClickに統一。
  // localStorage.setItem('customHolidays', JSON.stringify(Array.from(new Set(JSON.parse(localStorage.getItem('customHolidays') || '[]')))));
  // localStorage.setItem('workingDays', JSON.stringify(Array.from(new Set(JSON.parse(localStorage.getItem('workingDays') || '[]')))));
  // チェックボックスの状態も保存
  localStorage.setItem('includeOneMonthPass', isOneMonthChecked);
  localStorage.setItem('includeThreeMonthPass', isThreeMonthChecked);
  localStorage.setItem('includeSixMonthPass', isSixMonthChecked);

  return params;
}

/**
 * 休日リストを生成する
 * @returns {{gasHolidays: string[], calendarHolidays: string[]}}
 */
function generateHolidayLists() {
  const gasHolidays = [];
  const calendarHolidays = [];
  const startDate = new Date(document.getElementById('startDate').value);
  const duration = Number(document.getElementById('duration').value);
  if (startDate && !isNaN(startDate.getTime()) && duration > 0) {
    const simEndDate = new Date(startDate);
    // シミュレーション期間の最終日をGASと合わせる (例: 2025/9/1から12ヶ月後 -> 2026/8/31)。-1することで正しい最終日になる。
    const actualSimEndDate = addDays(addMonths(startDate, duration), -1);

    const daySettings = getDaySettings();
    const customHolidays = new Set(JSON.parse(localStorage.getItem('customHolidays') || '[]'));
    const customWorkdays = new Set(JSON.parse(localStorage.getItem('workingDays') || '[]'));
    const nationalHolidays = new Set();
    if (document.getElementById('includeHolidays').checked && holiday_jp) {

      // カレンダー表示とGASへの送信、両方をカバーする祝日を取得 (シミュレーション開始年の1月1日から、終了年の12月31日まで)
      const calendarPeriodStart = new Date(startDate.getFullYear(), 0, 1);
      const calendarPeriodEnd = new Date(actualSimEndDate.getFullYear(), 11, 31);
      const holidays = holiday_jp.between(calendarPeriodStart, calendarPeriodEnd);
      holidays.forEach(h => nationalHolidays.add(dateToKey(h.date)));
    }

    // カレンダー表示用とGAS送信用、両方の休日リストを一度に生成
    for (let d = new Date(startDate.getFullYear(), 0, 1); d <= new Date(actualSimEndDate.getFullYear(), 11, 31); d.setDate(d.getDate() + 1)) {
      const key = dateToKey(d);
      if (isHoliday(key, d, daySettings, customHolidays, customWorkdays, nationalHolidays)) {
        calendarHolidays.push(key);
        // GASに渡すリストには、シミュレーション期間内の休日のみを追加
        if (d >= startDate && d <= actualSimEndDate) {
          gasHolidays.push(key);
        }
      }
    }
  }
  // 重複を除去して返す
  return {
    gasHolidays: Array.from(new Set(gasHolidays)),
    calendarHolidays: Array.from(new Set(calendarHolidays))
  };
}

/**
 * Supabaseからキャッシュを検索する
 * @param {object} params - 検索パラメータ
 * @param {object} supabase - Supabaseクライアントインスタンス
 * @returns {Promise<object|null>} - キャッシュが見つかれば結果オブジェクト、なければnull
 */
async function findCacheInSupabase(params, supabase) {
  const { data, error } = await supabase
    .from('CALCULATION_LOGS')
    .select('*')
    .eq('DEVICE_ID', params.deviceId || "") // カラム名をDEVICE_IDに変更
    .eq('FARE', Number(params.fare) || 0)
    .eq('MONTHLY_PASS', Number(params.monthlyPass) || 0)
    .eq('THREE_MONTH_PASS', Number(params.threeMonthPass) || 0)
    .eq('SIX_MONTH_PASS', Number(params.sixMonthPass) || 0)
    .eq('START_DATE', params.startDate || "")
    .eq('DURATION_IN_MONTHS', params.durationInMonths || "")
    .eq('HOLIDAYS_LIST', params.holidays || "") // 主キーの一部として検索
    .eq('CACHE_VERSION', params.cacheVersion) // パラメータからバージョンを取得
    .order('CREATED_AT', { ascending: false })
    .limit(1);

  if (error) {
    console.error("Supabaseキャッシュの検索中にエラー:", error);
    return null;
  }

  if (data && data.length > 0) {
    console.log("Supabaseのキャッシュを利用しました。");
    const log = data[0];

    // --- キャッシュ利用時にも、比較プランのラベルを動的に生成する ---
    let shortestPassOnFirstLabel = '月初購入プラン'; // デフォルト
    if (params.monthlyPass > 0) {
      shortestPassOnFirstLabel = '月初1ヶ月定期';
    } else if (params.threeMonthPass > 0) {
      shortestPassOnFirstLabel = '月初3ヶ月定期';
    } else if (params.sixMonthPass > 0) {
      shortestPassOnFirstLabel = '月初6ヶ月定期';
    }

    return {
      status: "cache",
      message: "過去の計算結果を再利用しました。",
      result: {
        totalCost: log.TOTAL_COST,
        purchasePath: log.PURCHASE_PATH,
        comparisonCosts: {
          'すべて切符で利用': log.COST_ALL_TICKETS,
          'ベースラインプラン': log.COST_BASELINE,
          [shortestPassOnFirstLabel]: log.COST_MONTHLY_ON_FIRST // 動的キーで設定
        },
        holidays: params.holidays.split(',')
      }
    };
  }
  return null;
}

/**
 * 計算結果をSupabaseに保存する
 * @param {object} params - 計算時のパラメータ
 * @param {object} result - GASからの計算結果
 * @param {object} supabase - Supabaseクライアントインスタンス
 */
async function saveLogToSupabase(params, result, supabase) {
  const newLogPayload = {
    DEVICE_ID: params.deviceId, // カラム名をDEVICE_IDに変更
    FARE: params.fare,
    MONTHLY_PASS: params.monthlyPass,
    THREE_MONTH_PASS: params.threeMonthPass,
    SIX_MONTH_PASS: params.sixMonthPass,
    START_DATE: params.startDate,
    DURATION_IN_MONTHS: params.durationInMonths,
    HOLIDAYS_LIST: params.holidays,
    TOTAL_COST: result.totalCost,
    PURCHASE_PATH: result.purchasePath,
    EXECUTION_TIME_SEC: result.executionTime || 0, // GASから受け取った計算時間を保存
    PURCHASE_DAYS_COUNT: result.purchaseDaysCount || 0,
    SIMULATION_CALLS: result.simulationCalls || 0,
    MEMO_HITS: result.memoHits || 0
  };

  // --- 比較プランのコストを動的キーから特定して追加 ---
  const costs = result.comparisonCosts || {};
  newLogPayload.COST_ALL_TICKETS = costs['すべて切符で利用'] || 0;
  // '〇ヶ月定期で更新' または 'ベースラインプラン' というキーを持つ値を探す
  newLogPayload.COST_BASELINE = Object.values(costs).find((v, i) => Object.keys(costs)[i].includes('定期で更新') || Object.keys(costs)[i].includes('ベースライン')) || 0;
  // '月初' で始まるキーを持つ値を探す
  newLogPayload.COST_MONTHLY_ON_FIRST = Object.values(costs).find((v, i) => Object.keys(costs)[i].startsWith('月初')) || 0;
  newLogPayload.CACHE_VERSION = params.cacheVersion; // パラメータからバージョンを取得

  // insertの代わりにupsertを使用し、主キーが重複した場合はデータを更新する
  const { error } = await supabase.from('CALCULATION_LOGS').upsert(newLogPayload);
  if (error) {
    console.error("Supabaseへのログ保存中にエラー:", error);
  } else {
    console.log("計算結果をSupabaseに保存しました。");
  }
}

/**
 * 計算結果ページに遷移する
 * @param {object} response - 表示する結果データ
 * @param {object} params - 計算時のパラメータ
 */
function redirectToResultPage(response, params) {
  // result.htmlでカレンダー描画に必要な休日リストを取得
  const { calendarHolidays } = generateHolidayLists();

  // result.htmlで必要なデータをひとつのオブジェクトにまとめる
  const dataForNextPage = {
    resultData: response,
    paramsData: {
      ...params,
      // 休日リストはURLではなく、ここでparamsに含めて渡す
      calendarHolidays: calendarHolidays.join(','),
    }
  };

  // localStorageに一時的なデータとして保存
  localStorage.setItem('simulationResultData', JSON.stringify(dataForNextPage));

  // パラメータなしで結果ページへ遷移
  window.location.href = 'result.html';
}

document.getElementById('calculateBtn').addEventListener('click', async () => {
  const params = getParamsFromForm();
  if (!params) return;

  const calcButton = document.getElementById('calculateBtn');
  calcButton.disabled = true;
  calcButton.textContent = '計算中...';

  // Google Analytics イベントトラッキング
  if (typeof gtag === 'function') gtag('event', 'calculate_click');

  // --- デバッグモードの判定 ---
  const urlForDebug = new URLSearchParams(window.location.search);
  const isDebugMode = urlForDebug.get('debug') === 'true';
  if (isDebugMode) {
    console.log("デバッグモード: キャッシュ検索をスキップします。");
  }

  const cachedResult = isDebugMode ? null : await findCacheInSupabase(params, supabase);

  if (cachedResult) {
    // --- 2a. キャッシュがあれば、それを使って結果ページへ ---
    redirectToResultPage(cachedResult, params);
  } else {
    // --- 2b. キャッシュがなければ、GASに計算をリクエスト ---
    const gasUrl = GAS_URL; // 環境設定からURLを取得
    const queryString = Object.keys(params).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join('&');
    
    // JSONPリクエスト
    const script = document.createElement('script');
    const callbackName = 'gasCallback_' + Date.now();
    script.src = `${gasUrl}?callback=${callbackName}&${queryString}`;

    window[callbackName] = async (response) => {
      if (response && response.status === 'success' && response.result) {
        // --- 3. GASの結果をSupabaseに保存し、結果ページへ ---
        await saveLogToSupabase(params, response.result, supabase);
        redirectToResultPage(response, params);
      } else {
        alert('エラーが発生しました: ' + (response.message || '不明なエラー'));
        calcButton.disabled = false;
        calcButton.textContent = '計算する';
      }
      // 後処理
      document.body.removeChild(script);
      delete window[callbackName];
    };

    script.onerror = () => {
      alert('計算サーバーとの通信に失敗しました。');
      calcButton.disabled = false;
      calcButton.textContent = '計算する';
      document.body.removeChild(script);
      delete window[callbackName];
    };

    document.body.appendChild(script);
  }
});

document.getElementById('includeOneMonthPass').addEventListener('change', (event) => {
  const inputDiv = document.getElementById('oneMonthPassInput');
  inputDiv.style.display = event.target.checked ? 'block' : 'none';
});

document.getElementById('includeThreeMonthPass').addEventListener('change', (event) => {
  const inputDiv = document.getElementById('threeMonthPassInput');
  inputDiv.style.display = event.target.checked ? 'block' : 'none';
});

document.getElementById('includeSixMonthPass').addEventListener('change', (event) => {
  const inputDiv = document.getElementById('sixMonthPassInput');
  inputDiv.style.display = event.target.checked ? 'block' : 'none';
});

// --- 休日設定のロジック ---
/** 曜日ごとの設定カードを動的に生成 */
function createDaySettingCards() {
  const container = document.querySelector('.day-settings-list');
  const days = [ {label: '月', value: 1}, {label: '火', value: 2}, {label: '水', value: 3}, {label: '木', value: 4}, {label: '金', value: 5}, {label: '土', value: 6}, {label: '日', value: 0} ];
  const savedSettings = JSON.parse(localStorage.getItem('daySettings')) || { '0': 'holiday', '6': 'holiday' }; // デフォルトは土日休み

  container.innerHTML = days.map(day => {
    const setting = savedSettings[day.value] || 'work'; // デフォルトは勤務
    return `
      <div class="day-setting-row">
        <div class="day-label">${day.label}曜</div>
        <div>
          <select data-day="${day.value}">
            <option value="work" ${setting === 'work' ? 'selected' : ''}>勤務</option>
            <option value="holiday" ${setting === 'holiday' ? 'selected' : ''}>毎週休み</option>
            <option value="biweekly_odd" ${setting === 'biweekly_odd' ? 'selected' : ''}>隔週休み(奇数週)</option>
            <option value="biweekly_even" ${setting === 'biweekly_even' ? 'selected' : ''}>隔週休み(偶数週)</option>
          </select>
        </div>
      </div>
    `;
  }).join('');
}

/** 曜日設定のプルダウンから値を取得 */
function getDaySettings() {
  const settings = {};
  document.querySelectorAll('.day-settings-list select').forEach(select => {
    settings[select.dataset.day] = select.value;
  });
  return settings;
}

/** カスタム休日/勤務日のタグを描画 */
function renderCustomDateTags() {
  const container = document.getElementById('custom-dates-tags');
  // localStorageから読み込む際は、常にJSON.parseを使う
  const customHolidays = new Set(JSON.parse(localStorage.getItem('customHolidays') || '[]'));
  const customWorkdays = new Set(JSON.parse(localStorage.getItem('workingDays') || '[]'));
  container.innerHTML = '';
  
  customHolidays.forEach(date => container.appendChild(createTag(date, 'holiday')));
  customWorkdays.forEach(date => container.appendChild(createTag(date, 'workday')));
}

/** タグ要素を生成 */
function createTag(date, type) {
  const li = document.createElement('li');
  li.className = 'holiday-tag';
  li.textContent = `${date} (${type === 'holiday' ? '休日' : '勤務日'})`;
  if (type === 'national-holiday') {
    li.textContent = `${date} (祝日)`;
    li.classList.add('is-national-holiday');
  } else {
    li.style.backgroundColor = type === 'holiday' ? '#fff5e6' : '#e6f9f0'; // カスタム休日: オレンジ, カスタム勤務日: 緑
    li.style.borderColor = type === 'holiday' ? '#ffe8cc' : '#cce9d4';
  }
  li.style.border = '1px solid';

  // カスタム休日/勤務日の場合にのみ削除ボタンを追加
  if (type !== 'national-holiday') {
    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = '&times;';
    removeBtn.onclick = (e) => {
      e.stopPropagation(); // 親要素へのイベント伝播を停止
      const customHolidays = new Set(JSON.parse(localStorage.getItem('customHolidays') || '[]'));
      const customWorkdays = new Set(JSON.parse(localStorage.getItem('workingDays') || '[]'));
      if (type === 'holiday') {
        customHolidays.delete(date);
      } else { // 'workday'
        customWorkdays.delete(date);
      }
      localStorage.setItem('customHolidays', JSON.stringify(Array.from(customHolidays)));
      localStorage.setItem('workingDays', JSON.stringify(Array.from(customWorkdays)));
      renderCustomDateTags();
      drawSettingCalendar();
    };
    li.appendChild(removeBtn);
  }
  return li;
}

/**
 * =================================================
 * 設定用カレンダーのロジック
 * =================================================
 */

/**
 * 指定された日付に月数を加算する
 * @param {Date} date - 元の日付
 * @param {number} months - 加算する月数
 * @returns {Date} 新しい日付
 */
function addMonths(date, months) {
  const newDate = new Date(date);
  newDate.setMonth(newDate.getMonth() + months);
  return newDate;
}

/**
 * 日付を加算・減算する
 * @param {Date} date - 元の日付
 * @param {number} days - 加算する日数（負数で減算）
 * @returns {Date} 新しい日付
 */
const addDays = (date, days) => {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + days);
  return newDate;
};
/**
 * 日付を 'yyyy-MM-dd' 形式の文字列に変換 */
const dateToKey = (d) => {
    if (!d || !(d instanceof Date)) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
};

/**
 * その月の第何週目かを取得する
 * @param {Date} d - 日付オブジェクト
 * @param {number} weekStartDay - 週の始まりの曜日 (0:日曜, 1:月曜)
 * @returns {number} 週番号
 */
const getWeekNumber = (d, weekStartDay) => {
    const date = d.getDate();
    const day = d.getDay();
    // 月の1日の曜日を考慮して週番号を計算
    const firstDayOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
    return Math.ceil((date + (firstDayOfMonth - weekStartDay + 7) % 7) / 7);
};

/**
 * 現在のフォーム設定に基づいて、特定の日付が休日かどうかを判定する
 * @param {string} dateKey - 'yyyy-MM-dd'形式の日付文字列
 * @param {Date} dateObj - 対応するDateオブジェクト
 * @param {Object} daySettings - 曜日ごとの設定
 * @param {Set<string>} nationalHolidays - 祝日のSet
 * @param {Set<string>} customHolidays - カスタム休日のSet
 * @param {Set<string>} customWorkdays - カスタム勤務日のSet
 * @returns {boolean} 休日であればtrue
*/
function isHoliday(dateKey, dateObj, daySettings, customHolidays, customWorkdays, nationalHolidays) {
    // dateObjが不正な場合にエラーで停止するのを防ぐ
    if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) return false;

    // 1. カスタム設定を最優先する
    if (customWorkdays.has(dateKey)) return false;
    if (customHolidays.has(dateKey)) return true;

    // 2. 祝日を判定する (holiday-jp-dayjsライブラリを使用)
    if (nationalHolidays.has(dateKey)) return true; // nationalHolidaysはdrawSettingCalendarで生成される

    // 3. 曜日ごとの設定を判定する
    const dayOfWeek = dateObj.getDay();
    const setting = daySettings[dayOfWeek];
    if (setting === 'holiday') return true;
    const weekNumber = getWeekNumber(dateObj, Number(document.querySelector('input[name="weekStart"]:checked').value));
    if (setting === 'biweekly_odd' && weekNumber % 2 !== 0) return true;
    if (setting === 'biweekly_even' && weekNumber % 2 === 0) return true;

    return false; // 上記のいずれにも該当しない場合は勤務日
}

/** カレンダーの日付クリックを処理 */
function handleCalendarClick(event) {
    const cell = event.target.closest('.setting-calendar-cell');
    const dateKey = cell.dataset.date;
    if (!dateKey) return;

    const dateObj = new Date(dateKey + 'T00:00:00'); // タイムゾーン問題を避けるためT00:00:00を付与
    const daySettings = getDaySettings();
    // localStorageから読み込む際は、常にJSON.parseを使う
    const customHolidays = new Set(JSON.parse(localStorage.getItem('customHolidays') || '[]'));
    const customWorkdays = new Set(JSON.parse(localStorage.getItem('workingDays') || '[]'));

    // クリック時の状態遷移ロジック
    if (customWorkdays.has(dateKey)) {
        // 「カスタム勤務日」を解除 → 元の状態（isBaseHoliday）に戻る
        customWorkdays.delete(dateKey);
    } else if (customHolidays.has(dateKey)) {
        // 「カスタム休日」を解除 → 元の状態（isBaseHoliday）に戻る
        customHolidays.delete(dateKey);
    } else {
        // 曜日設定に基づく休日判定
        const isNationalHoliday = document.getElementById('includeHolidays').checked && holiday_jp.isHoliday(dateObj);
        const dayOfWeek = dateObj.getDay();
        const setting = daySettings[dayOfWeek];
        const weekNumber = getWeekNumber(dateObj, Number(document.querySelector('input[name="weekStart"]:checked').value));
        const isBaseHoliday = (setting === 'holiday') || (setting === 'biweekly_odd' && weekNumber % 2 !== 0) || (setting === 'biweekly_even' && weekNumber % 2 === 0) || isNationalHoliday;
        isBaseHoliday ? customWorkdays.add(dateKey) : customHolidays.add(dateKey);
    }

    // 変更をLocalStorageに保存
    localStorage.setItem('customHolidays', JSON.stringify(Array.from(customHolidays)));
    localStorage.setItem('workingDays', JSON.stringify(Array.from(customWorkdays)));

    drawSettingCalendar(); // 状態が更新されたのでカレンダーを再描画
}

/** 設定用カレンダーを描画・更新する */
function drawSettingCalendar() {
    const calendarView = document.getElementById('settingCalendarView');
    calendarView.innerHTML = ''; // コンテナをクリア

    const startDateStr = document.getElementById('startDate').value;
    const startDate = new Date(startDateStr);
    // 開始日が不正な場合はここで処理を中断
    if (!startDateStr || isNaN(startDate.getTime())) return;

    const duration = Number(document.getElementById('duration').value) || 12;

    // --- この関数内で使用する休日セットをすべて生成する ---
    const daySettings = getDaySettings();
    // localStorageから読み込む際は、常にJSON.parseを使う
    const customHolidays = new Set(JSON.parse(localStorage.getItem('customHolidays') || '[]'));
    const customWorkdays = new Set(JSON.parse(localStorage.getItem('workingDays') || '[]'));

    const includeHolidays = document.getElementById('includeHolidays').checked;
    const nationalHolidays = new Set();
    if (includeHolidays && holiday_jp) {
        // カレンダーに表示される期間全体の祝日を取得する
        const simEndDateForHoliday = addDays(addMonths(startDate, duration), -1);
        // 開始日: 表示する最初の月の1日
        const calendarPeriodStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        // 終了日: 表示する最後の月の末日
        const calendarPeriodEnd = new Date(simEndDateForHoliday.getFullYear(), 11, 31);
        const holidays = holiday_jp.between(calendarPeriodStart, calendarPeriodEnd);

        for (const holiday of holidays) {
            nationalHolidays.add(dateToKey(holiday.date));
        }
    }

    renderCustomDateTags(); // カスタム休日タグを再描画

    const weekStartDay = Number(document.querySelector('input[name="weekStart"]:checked').value); // 0:日曜, 1:月曜
    const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
    if (weekStartDay === 1) { weekDays.push(weekDays.shift()); }

    // シミュレーション終了日を計算 (例: 9/12から12ヶ月 -> 翌年9/11)
    const simEndDate = addDays(addMonths(startDate, duration), -1); 

    // 描画対象の最初の月から最後の月までループ
    for (let d = new Date(startDate.getFullYear(), startDate.getMonth(), 1); 
         d <= simEndDate; 
         d.setMonth(d.getMonth() + 1)) {
        const year = d.getFullYear();
        const month = d.getMonth();

        const monthContainer = document.createElement('div');
        monthContainer.className = 'setting-month-container';
        monthContainer.innerHTML = `
            <div style="font-size: 16px; font-weight: 600; text-align: center; margin-bottom: 8px; color: var(--primary-color);">${year}年 ${month + 1}月</div>
            <div class="week-header">${weekDays.map(d => `<div>${d}</div>`).join('')}</div>
            <div class="setting-calendar-grid"></div>
        `;
        const grid = monthContainer.querySelector('.setting-calendar-grid');

        const firstDateOfMonth = new Date(year, month, 1);
        const calendarStartDate = new Date(firstDateOfMonth);
        calendarStartDate.setDate(calendarStartDate.getDate() - ((firstDateOfMonth.getDay() - weekStartDay + 7) % 7));

        // 6週間(42日)で固定することで、月の表示が崩れるのを防ぐ
        const totalDaysInGrid = 42;

        for (let i = 0; i < totalDaysInGrid; i++) {
            const currentDate = new Date(calendarStartDate);
            currentDate.setDate(currentDate.getDate() + i);
            const key = dateToKey(currentDate);

            const cell = document.createElement('div');
            cell.className = 'setting-calendar-cell';
            cell.textContent = currentDate.getDate();
            cell.dataset.date = key;

            if (currentDate.getMonth() !== month) {
                cell.classList.add('is-other-month');
            } else {
                // --- セルの状態に応じたクラス設定 ---
                if (customHolidays.has(key)) cell.classList.add('is-custom-holiday');
                else if (customWorkdays.has(key)) cell.classList.add('is-custom-workday');
                else if (isHoliday(key, currentDate, daySettings, customHolidays, customWorkdays, nationalHolidays)) cell.classList.add('is-holiday');
                cell.addEventListener('click', handleCalendarClick);
            }
            grid.appendChild(cell);
        }
        calendarView.appendChild(monthContainer);
    }
}

/**
 * ページ読み込み時にLocalStorageから設定を復元する
 */
function restoreFormState() {
    // 金額入力欄
    ['fare', 'monthlyPass', 'threeMonthPass', 'sixMonthPass'].forEach(id => {
        const rawValue = localStorage.getItem(id);
        if (rawValue) document.getElementById(id).value = rawValue;
    });

    // 日付と期間
    const startDate = localStorage.getItem('startDate');
    document.getElementById('startDate').value = startDate || dateToKey(new Date());
    const duration = localStorage.getItem('durationInMonths');
    if (duration) document.getElementById('duration').value = duration;

    // 定期券チェックボックスと入力欄の表示/非表示
    ['One', 'Three', 'Six'].forEach(period => {
        const checkboxId = `include${period}MonthPass`;
        const inputDivId = `${period.toLowerCase()}MonthPassInput`;
        const isChecked = localStorage.getItem(checkboxId) === 'true';
        const checkbox = document.getElementById(checkboxId);
        // 1ヶ月定期はデフォルトでチェックONなので、保存された値がnullの場合も考慮
        if (period === 'One') {
            checkbox.checked = localStorage.getItem(checkboxId) !== 'false';
        } else {
            checkbox.checked = isChecked;
        }
        document.getElementById(inputDivId).style.display = checkbox.checked ? 'block' : 'none';
    });

    // 休日設定
    const includeHolidays = localStorage.getItem('includeHolidays');
    if (includeHolidays !== null) document.getElementById('includeHolidays').checked = (includeHolidays === 'true');

    // 週の始まり
    const savedWeekStart = localStorage.getItem('weekStartPreference');
    if (savedWeekStart) {
        const radio = document.querySelector(`input[name="weekStart"][value="${savedWeekStart}"]`);
        if (radio) radio.checked = true;
    }
}

// --- イベントリスナー ---

/**
 * アプリケーションの初期化処理
 */
async function initializeApp() {
    createDaySettingCards(); // 曜日設定カードを生成
    restoreFormState();      // LocalStorageから設定を復元

    // 週の始まりラジオボタンにイベントリスナーを追加
    document.querySelectorAll('input[name="weekStart"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            localStorage.setItem('weekStartPreference', e.target.value); // 共通キーで設定を保存
            drawSettingCalendar(); // ラジオボタンが変更されたらカレンダーを再描画
        });
    });

    // --- アップグレード直後の期間更新処理 ---
    if (localStorage.getItem('justUpgraded') === 'true') {
        const plan = localStorage.getItem('licensePlan');
        const newDefault = (plan === 'pro') ? '24' : '12'; // standard or pro
        localStorage.setItem('durationInMonths', newDefault);
        localStorage.removeItem('justUpgraded'); // フラグは一度使ったら削除
    }

    // この関数はグローバルスコープの initialLicensePlan を初期化する
    initialLicensePlan = localStorage.getItem('licensePlan'); // 初期プランを記憶

    // --- ライセンス状態の確認とUI反映 ---
    const upgradeNotice = document.getElementById('upgrade-notice');
    const upgradeLink = document.getElementById('open-pricing-from-notice');

    // deviceIdがなければここで生成・保存する
    if (!localStorage.getItem('deviceId')) { localStorage.setItem('deviceId', 'device_' + Date.now()); }

    // 期間選択のプルダウンを生成
    const durationSelect = document.getElementById('duration');
    durationSelect.innerHTML = ''; // 既存の選択肢をクリア

    let maxDuration = 12;
    let defaultDuration = '12';

    const licensePlan = localStorage.getItem('licensePlan');
    if (!licensePlan) { // フリープラン
      maxDuration = 4;
      defaultDuration = '4';
      if (upgradeNotice) upgradeNotice.style.display = 'block';
    } else if (licensePlan === 'pro') { // プロプラン
      maxDuration = 24;
      defaultDuration = '24'; // プロプランのデフォルトを最大値である24ヶ月に設定
      if (upgradeNotice) upgradeNotice.style.display = 'none';
    } else { // スタンダードプランの場合も案内は非表示にする
      if (upgradeNotice) upgradeNotice.style.display = 'none';
    }
    // スタンダードプランはデフォルトの maxDuration = 12 のまま

    for (let i = 2; i <= maxDuration; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = i;
      durationSelect.appendChild(option);
    }

    let savedDuration = localStorage.getItem('durationInMonths');

    // --- プラン変更時の期間整合性ロジック ---
    // 保存された期間が、現在のプランで選択可能な最大期間を超えている場合
    // (例: プロ(24ヶ月)からスタンダード(12ヶ月)にダウングレードした場合など)
    // は、現在のプランのデフォルト値にリセットする。
    if (savedDuration && Number(savedDuration) > maxDuration) {
        // 保存された値が現在のプランの上限を超えている場合は、デフォルト値にリセット
        savedDuration = defaultDuration;
    }
    durationSelect.value = savedDuration || defaultDuration; // 保存された値がなければデフォルト値を使用

    // --- プランに応じた定期券入力欄の表示制御 ---
    // 各定期券のチェックボックスと入力欄の要素を取得
    const threeMonthCheckbox = document.getElementById('includeThreeMonthPass');
    const sixMonthCheckbox = document.getElementById('includeSixMonthPass');
    const threeMonthPassGroup = document.getElementById('threeMonthPassInput').closest('.input-group');
    const sixMonthPassGroup = document.getElementById('sixMonthPassInput').closest('.input-group');

    if (localStorage.getItem('licenseKey') && licensePlan) {
        document.getElementById('openLicenseForm').innerHTML = '<i class="fa-solid fa-user-check"></i>ライセンス情報';
        // 有料プランの場合は広告を非表示にする
        const adContainer = document.getElementById('ad-container-index');
        if (adContainer) {
            adContainer.style.display = 'none';
        }
    }

    if (!licensePlan) {
        if (threeMonthPassGroup) threeMonthPassGroup.style.display = 'none';
        if (threeMonthCheckbox) threeMonthCheckbox.checked = false;
        localStorage.setItem('includeThreeMonthPass', 'false');

        if (sixMonthPassGroup) sixMonthPassGroup.style.display = 'none';
        if (sixMonthCheckbox) sixMonthCheckbox.checked = false;
        localStorage.setItem('includeSixMonthPass', 'false');
    } else {
        // 有料プランの場合は表示を元に戻す（プラン変更時のため）
        if (threeMonthPassGroup) threeMonthPassGroup.style.display = 'block';
        if (sixMonthPassGroup) sixMonthPassGroup.style.display = 'block';
    }

    // 休日設定に関連するすべての入力要素にイベントリスナーを設定
    const holidaySettingElements = [
        ...document.querySelectorAll('.day-settings-list select'),
        document.getElementById('includeHolidays'),
        document.getElementById('startDate'),
        document.getElementById('duration')
    ];
    holidaySettingElements.forEach(el => {
        el.addEventListener('change', drawSettingCalendar);
    });

    if (upgradeLink) {
        upgradeLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.open_pricingModal) window.open_pricingModal();
        });
    }

    // カレンダーを初期描画
    if (document.getElementById('startDate').value) {
        drawSettingCalendar();
    }
}

/**
 * プランの内部名から表示名を取得する
 * @param {string} planName - プランの内部名 (e.g., 'standard')
 * @returns {string} 表示用のプラン名 (e.g., 'スタンダード プラン')
 */
function getPlanDisplayName(planName) {
    const names = { 'free': 'フリー プラン', 'standard': 'スタンダード プラン', 'pro': 'プロ プラン' };
    return names[planName] || `${planName} プラン`;
}

/**
 * 有効期限の日付文字列をフォーマットする
 * @param {string} expiresAtStr - ISO 8601形式の日付文字列
 * @returns {string} フォーマットされた日付文字列 (例: 2026年10月7日 23:59 まで)
 */
function formatExpiresAt(expiresAtStr) {
    if (!expiresAtStr || expiresAtStr === 'null') return 'N/A';
    // DBには「有効期限の翌日0時」が保存されているため、表示上は1日引く
    const expiresDate = new Date(expiresAtStr);
    expiresDate.setDate(expiresDate.getDate() - 1);

    return `${expiresDate.getFullYear()}年${expiresDate.getMonth() + 1}月${expiresDate.getDate()}日 23:59 まで`;
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
/**
 * =================================================
 * 金額入力欄の入力制御
 * =================================================
 */
const amountInputs = ['fare', 'monthlyPass', 'threeMonthPass', 'sixMonthPass', 'duration'];

amountInputs.forEach(id => {
  const input = document.getElementById(id);
  if (!input) return;

  const sanitizeInput = (e) => {
    const inputElement = e.target;
    if (e.isComposing || inputElement.readOnly) return;
    const originalValue = inputElement.value;
    let sanitizedValue = originalValue.replace(/[^0-9]/g, '');
    if (sanitizedValue.length > 1 && sanitizedValue.startsWith('0')) {
      sanitizedValue = sanitizedValue.substring(1);
    }
    const maxLength = 6;
    sanitizedValue = sanitizedValue.slice(0, maxLength);
    if (originalValue !== sanitizedValue) {
      inputElement.value = sanitizedValue;
    }
  };

  input.addEventListener('input', sanitizeInput);
  input.addEventListener('compositionend', sanitizeInput);
});

/**
 * =================================================
 * 認証状態変更に伴うUI更新
 * =================================================
 */

/**
 * ライセンスプランの変更を検知し、UIを動的に更新する
 * ページリロードなしで、シミュレーション期間や定期券入力欄を更新する
 */
function updateUIForAuthChange() {
    const licensePlan = localStorage.getItem('licensePlan');
    const durationSelect = document.getElementById('duration');
    const upgradeNotice = document.getElementById('upgrade-notice');
    const threeMonthPassGroup = document.getElementById('threeMonthPassInput').closest('.input-group');
    const sixMonthPassGroup = document.getElementById('sixMonthPassInput').closest('.input-group');
    const adContainer = document.getElementById('ad-container-index');

    let maxDuration, defaultDuration;

    if (!licensePlan) { // フリープラン
        maxDuration = 4;
        defaultDuration = '4';
        if (upgradeNotice) upgradeNotice.style.display = 'block';
        if (threeMonthPassGroup) threeMonthPassGroup.style.display = 'none';
        if (sixMonthPassGroup) sixMonthPassGroup.style.display = 'none';
        if (adContainer) adContainer.style.display = 'block';
    } else { // 有料プラン
        maxDuration = (licensePlan === 'pro') ? 24 : 12;
        defaultDuration = (licensePlan === 'pro') ? '24' : '12';
        if (upgradeNotice) upgradeNotice.style.display = 'none';
        if (threeMonthPassGroup) threeMonthPassGroup.style.display = 'block';
        if (sixMonthPassGroup) sixMonthPassGroup.style.display = 'block';
        if (adContainer) adContainer.style.display = 'none';
    }

    // 期間選択プルダウンを再生成
    durationSelect.innerHTML = '';
    for (let i = 2; i <= maxDuration; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        durationSelect.appendChild(option);
    }

    // 現在の期間が新しい上限を超えていたらリセット
    if (Number(durationSelect.value) > maxDuration) {
        durationSelect.value = defaultDuration;
    }
}
/**
 * =================================================
 * ページの初期化とイベントリスナーの登録
 * =================================================
 */
document.addEventListener('DOMContentLoaded', async () => {
    // グローバル変数の初期化
    window.initialLicensePlan = null;
    window.stripeCheckout = null;

    // --- 設定ファイルの読み込み ---
    const { APP_CONFIG, APP_ENV } = await configPromise;
    config = APP_CONFIG;
    window.APP_CONFIG = config; // グローバルにも設定
    window.APP_ENV = APP_ENV;
    supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    STRIPE_PUBLISHABLE_KEY = config.stripePublishableKey;
    GAS_URL = config.gasUrl;

    // --- Google Analyticsの動的読み込み ---
    if (config.gaMeasurementId) {
        const gtagScript = document.createElement('script');
        gtagScript.async = true;
        gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${config.gaMeasurementId}`;
        document.head.appendChild(gtagScript);
        window.dataLayer = window.dataLayer || [];
        window.gtag('js', new Date());
        window.gtag('config', config.gaMeasurementId);
        console.log(`Google Analyticsを読み込みました (ID: ${config.gaMeasurementId})`);
    }

    // --- 決済完了後のリダイレクト処理 ---
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    if (urlParams.get('payment') === 'success' && sessionId) {
        const modal = document.getElementById('paymentSuccessModal');
        const copyBtn = document.getElementById('copyLicenseKeyBtn');
        const authInfoContainer = document.getElementById('authInfoContainer');
        const display = document.getElementById('licenseKeyDisplay');
        const planNameEl = document.getElementById('purchasedPlanName');
        const expiresAtEl = document.getElementById('purchasedExpiresAt');
        const messageEl = document.getElementById('paymentSuccessMessage');
        modal.classList.add('is-visible');
        const setDeviceNameContainer = document.getElementById('setDeviceNameContainer');

        // URLから決済パラメータを削除
        window.history.replaceState({}, document.title, window.location.pathname);

        const fetchLicenseKey = async (retries = 5, delay = 2000) => {
            for (let i = 0; i < retries; i++) {
                try {
                    const { data, error } = await supabase.functions.invoke('retrieve-license-key', {
                        body: {
                            sessionId, // debugKeyは不要。Stripe Webhook側でlivemodeを判定するため。
                        }
                    });
                    if (error) throw error;

                    if (data && data.status === 'success') {
                        // 1. 認証情報をlocalStorageに保存
                        localStorage.setItem('licenseKey', data.licenseKey);
                        localStorage.setItem('licensePlan', data.plan);
                        localStorage.setItem('licenseExpiresAt', data.expiresAt);
                        localStorage.setItem('justUpgraded', 'true'); // プラン変更フラグ

                        // 2. UIを更新
                        messageEl.innerHTML = '<strong>認証が完了しました！</strong><br>ご購入いただいたプランが有効になりました。';
                        authInfoContainer.style.display = 'block';
                        planNameEl.textContent = getPlanDisplayName(data.plan);
                        expiresAtEl.textContent = formatExpiresAt(data.expiresAt);
                        display.textContent = maskLicenseKey(data.licenseKey); // 伏せ字で表示

                        // デバイス名設定フォームを表示
                        setDeviceNameContainer.style.display = 'block';

                        copyBtn.disabled = false;
                        copyBtn.addEventListener('click', () => {
                            navigator.clipboard.writeText(data.licenseKey).then(() => {
                                const originalText = copyBtn.innerHTML;
                                copyBtn.innerHTML = '<i class="fa-solid fa-check"></i>コピー完了';
                                setTimeout(() => {
                                    copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i>キーをコピー';
                                }, 2000);
                            });
                        });
                        copyBtn.style.display = 'inline-block'; // ボタンを表示

                        return; // 成功したらループを抜ける
                    } else if (data && data.status === 'pending') {
                        // 'pending'ステータスを受け取った場合は、何もせず次のリトライに進む
                        console.log(`Attempt ${i + 1}: License key is pending...`);
                    }
                } catch (e) {
                    console.error(`Attempt ${i + 1} failed:`, e);
                }
                messageEl.innerHTML = `認証情報を確認中です... (試行 ${i + 1}/${retries})<br>この処理には少し時間がかかる場合があります。`;
                if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, delay));
            }
            // すべてのリトライが失敗した場合
            messageEl.innerHTML = '<strong>認証情報の取得に失敗しました。</strong><br>お手数ですが、メニューの「ライセンス認証」から、再度認証をお試しください。';
            // フッターノートを表示
            document.querySelectorAll('.payment-success-footer-note').forEach(el => {
                el.style.display = 'block';
            });
        };

        fetchLicenseKey();

        // 決済完了モーダル内のデバイス名設定ボタンの処理
        document.getElementById('submitPaymentSuccessDeviceNameBtn').addEventListener('click', async () => {
            const btn = document.getElementById('submitPaymentSuccessDeviceNameBtn');
            const newName = document.getElementById('paymentSuccessDeviceNameInput').value.trim();
            const messageEl = document.getElementById('paymentSuccessDeviceNameMessage');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 決定中...';
            await handleDeviceNameSubmission(newName, messageEl, () => location.reload(), btn, '決定して利用を開始する');
        });

        // モーダルを閉じたらページをリロードしてプランを反映
        modal.querySelector('.modal-close-btn').addEventListener('click', () => location.reload());
    }

    // 再来訪時のデバイス名設定モーダルの処理
    document.getElementById('submitDeviceNameBtn').addEventListener('click', async () => {
        const btn = document.getElementById('submitDeviceNameBtn');
        const newName = document.getElementById('deviceNameInput').value.trim();
        const messageEl = document.getElementById('deviceNameMessage');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 決定中...';
        await handleDeviceNameSubmission(newName, messageEl, () => location.reload(), btn, '決定');
    });

    // デバイス名設定の共通処理
    async function handleDeviceNameSubmission(newName, messageEl, onSuccessCallback, buttonElement, originalText) {
        if (!newName) {
            messageEl.textContent = 'デバイス名を入力してください。';
            messageEl.style.display = 'block';
            if (buttonElement) {
                buttonElement.disabled = false;
                buttonElement.innerHTML = originalText;
            }
            return;
        }
        messageEl.style.display = 'none';
        try {
            const { data, error } = await supabase.functions.invoke('update-device-name', {
                body: { appName: "TeKeep!", licenseKey: localStorage.getItem('licenseKey'), deviceId: localStorage.getItem('deviceId'), newDeviceName: newName }
            });
            if (error) throw error;
            if (data.status === 'success') {
                // 成功時の処理をコールバックで実行
                if (onSuccessCallback) onSuccessCallback();
            } else {
                messageEl.textContent = data.message || 'エラーが発生しました。';
                messageEl.style.display = 'block';
            }
        } catch (e) {
            messageEl.textContent = 'サーバーとの通信に失敗しました。';
            messageEl.style.display = 'block';
        } finally {
            // 成功時はリロードされるので、失敗した場合のみボタンの状態を戻す
            if (buttonElement && !buttonElement.disabled) {
                // この条件は、成功コールバックが呼ばれなかった場合にのみ真になる
            } else if (buttonElement) {
                // 成功しなかった場合（エラー表示された場合）
                buttonElement.disabled = false;
                buttonElement.innerHTML = originalText;
            }
        }
    }

    // 1. UIの初期化
    await initializeApp();

    // 2. UIイベントリスナーの登録

    // 3. 認証状態の同期
    await syncAuthState(supabase);

    // 4. シェアボタンのイベントリスナー
    const shareBtn = document.getElementById('shareBtn');
    const qrModal = document.getElementById('qrModal');
    const qrcodeContainer = document.getElementById('qrcode');

    if (shareBtn && qrModal && qrcodeContainer) {
      shareBtn.addEventListener('click', async () => {
        const shareData = {
          title: document.title,
          text: 'TeKeep!は、通勤・通学費を節約するためのシミュレーター。あなたの休日設定に合わせて、最も安くなる購入プランを簡単に見つけられます。',
          url: window.location.href
        };

        if (navigator.share) {
          // Web Share APIが使える場合 (スマホなど)
          try {
            await navigator.share(shareData);
          } catch (err) {
            console.error('共有に失敗しました:', err);
          }
        } else {
          // Web Share APIが使えない場合 (PCなど)
          // 1. URLをコピー
          navigator.clipboard.writeText(shareData.url).then(() => {
            const originalIcon = shareBtn.innerHTML;
            shareBtn.innerHTML = `<i class="fa-solid fa-check"></i>`;
            setTimeout(() => { shareBtn.innerHTML = originalIcon; }, 2000);
          });
          // 2. QRコードを生成してモーダル表示
          qrcodeContainer.innerHTML = ''; // 既存のQRコードをクリア
          new QRCode(qrcodeContainer, { text: shareData.url, width: 180, height: 180 });
          qrModal.classList.add('is-visible');
        }
      });

      // 閉じるボタンで閉じる
      const closeBtn = qrModal.querySelector('.modal-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => qrModal.classList.remove('is-visible'));
      }

      // モーダル外クリックで閉じる
      qrModal.addEventListener('click', (e) => {
        if (e.target === qrModal) {
          qrModal.classList.remove('is-visible');
        }
      });
    }
});

/**
 * =================================================
 * iframeからのメッセージ受信
 * =================================================
 */
window.addEventListener('message', async (event) => {

    // iframeのsrcを最新の状態で更新する関数
    const updateIframeSrc = (modalId) => {
        if (modalId === 'licenseModal') {
            const licenseKey = localStorage.getItem('licenseKey');
            const licensePlan = localStorage.getItem('licensePlan');
            const expiresAt = localStorage.getItem('licenseExpiresAt');
            const deviceId = localStorage.getItem('deviceId');
            const iframe = document.getElementById('licenseIframe');
            if (iframe) iframe.src = `license.html?key=${encodeURIComponent(licenseKey || '')}&plan=${encodeURIComponent(licensePlan || '')}&deviceId=${encodeURIComponent(deviceId || '')}&expiresAt=${encodeURIComponent(expiresAt || '')}`;
        } else if (modalId === 'pricingModal') {
            const licensePlan = localStorage.getItem('licensePlan');
            const iframe = document.getElementById('pricingIframe');
            if (iframe) iframe.src = `pricing.html?plan=${encodeURIComponent(licensePlan || 'free')}`;
        }
    };
    // モーダルを開く直前にiframeのsrcを更新する
    if (event.data && event.data.type === 'openModal') {
        updateIframeSrc(event.data.modalId);
    }

    // ui.jsからモーダルが閉じた通知を受け取る
    if (event.data && event.data.type === 'closeModal') {
        const currentLicensePlan = localStorage.getItem('licensePlan');
        if (event.data.modalId === 'licenseModal' && window.initialLicensePlan !== currentLicensePlan) {
            location.reload();
        }
    }

    // --- index.js固有のロジック ---

    // ここで送信元のオリジンをチェックすることも可能
    // if (event.origin !== 'https://your-domain.com') return;

    if (event.data && event.data.type === 'authSuccess') {
        // 認証成功のメッセージを受け取ったらライセンス情報を保存
        localStorage.setItem('licenseKey', event.data.key);
        localStorage.setItem('licensePlan', event.data.plan);
        localStorage.setItem('licenseExpiresAt', event.data.expiresAt);
        localStorage.setItem('justUpgraded', 'true'); // プラン変更フラグ

        // Google Analytics イベントトラッキング
        if (typeof gtag === 'function') {
            gtag('event', 'auth_success', { 'plan': event.data.plan });
        }
        updateUIForAuthChange(); // UIを動的に更新
    }
    if (event.data && event.data.type === 'startPayment') {
        if (typeof gtag === 'function') {
            gtag('event', 'start_payment', { 'plan': event.data.plan });
        }
    }
    if (event.data && event.data.type === 'authRevoke') {
        // 認証解除のメッセージを受け取ったらライセンス情報を削除
        localStorage.removeItem('licenseKey'); localStorage.removeItem('licensePlan');
        localStorage.removeItem('licenseExpiresAt');
        updateUIForAuthChange(); // UIを動的に更新
    }
    if (event.data && event.data.type === 'resize') {
        // iframeから高さ情報を受け取って調整
        if (event.data.source === 'license') {
            const licenseIframe = document.getElementById('licenseIframe');
            if (licenseIframe) licenseIframe.style.height = event.data.height + 'px';
        } else if (event.data.source === 'pricing') {
            const pricingIframe = document.getElementById('pricingIframe');
            if (pricingIframe) pricingIframe.style.height = event.data.height + 'px';
        } else if (event.data.source === 'tokushoho') {
            const tokushohoIframe = document.getElementById('tokushohoIframe');
            if (tokushohoIframe) tokushohoIframe.style.height = event.data.height + 'px';
        }
    }
    if (event.data && event.data.type === 'setDeviceId') {
        // license.htmlから新しいdeviceIdの保存要求
        // 設計意図: deviceIdは親ウィンドウ(index.html)のlocalStorageで一元管理する
        localStorage.setItem('deviceId', event.data.deviceId);
    }
    if (event.data && event.data.type === 'createCheckoutSession') {
        // pricing.htmlから決済セッション作成要求
        const { plan } = event.data;
        const deviceId = localStorage.getItem('deviceId');
        if (!deviceId) {
            alert('デバイスIDが取得できませんでした。ページをリロードしてください。');
            return;
        }
        try {
            const { data, error } = await supabase.functions.invoke('create-checkout-session', {
                body: {
                    plan,
                    deviceId,
                    // どの環境からのリクエストかを伝える
                    environment: window.APP_ENV,
                    // 決済完了後のリダイレクト先URLをフロントエンドから渡す
                    baseUrl: window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1)
                }
            });
            if (error) throw error;

            // 決済モーダルを開き、Stripe Checkoutを埋め込む
            const paymentModal = document.getElementById('paymentModal');
            paymentModal.classList.add('is-visible');

            // [修正] Stripeの初期化には、SupabaseのキーではなくStripeの公開キーを使用する
            const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
            window.stripeCheckout = await stripe.initEmbeddedCheckout({
              clientSecret: data.clientSecret,
            });
            window.stripeCheckout.mount('#checkout');

        } catch (e) {
            console.error('Stripe Checkoutセッションの作成に失敗しました:', e);
            // Edge Functionから返された具体的なエラーメッセージを優先的に表示する (e.context.json()はPromiseを返す)
            const errorData = await e.context?.json();
            const detailMessage = errorData?.message || e.message;
            alert('決済ページの準備に失敗しました。時間をおいて再度お試しください。\n\n詳細: ' + detailMessage);
            // pricing.htmlにエラーを通知してボタンの状態を元に戻させる
            const pricingIframe = document.getElementById('pricingIframe').contentWindow;
            if (pricingIframe) {
                pricingIframe.postMessage({ type: 'checkoutSessionFailed' }, '*');
            }
        }
    }
    if (event.data && event.data.type && event.data.type.startsWith('invoke:')) {
        // iframe (license.html) からのEdge Function実行リクエストを処理
        const functionName = event.data.type.split(':')[1];
        const { body } = event.data;
        if (!functionName || !body) return;

        const responseType = `response:${functionName}`;

        try {
            const { data: response, error } = await supabase.functions.invoke(functionName, { body });
            if (error) throw error;

            // 実行結果をiframeに返す
            const sourceIframe = document.getElementById('licenseIframe').contentWindow;
            if (sourceIframe) sourceIframe.postMessage({ type: responseType, response }, '*');

        } catch (e) {
            console.error(`${functionName} の呼び出しに失敗しました:`, e);
            // エラーが発生した場合も、その旨をiframeに通知する
            const sourceIframe = document.getElementById('licenseIframe').contentWindow;
            if (sourceIframe) {
                sourceIframe.postMessage({ type: responseType, response: { status: 'error', message: e.message } }, '*');
            }
        }
    }
});