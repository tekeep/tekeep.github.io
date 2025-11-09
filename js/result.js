import configPromise from './config.js';

function atMidnight(d){ const nd=new Date(d.getFullYear(),d.getMonth(),d.getDate()); nd.setHours(0,0,0,0); return nd; }
let myChart = null; // Chart.jsのインスタンスを保持するグローバル変数
let currentResultData = null; // GASからの結果を保持するグローバル変数
let currentParams = null; // 計算時のパラメータを保持するグローバル変数
let initialLicensePlan = null; // 初期プランを記憶
let calendarDisplayMode = 'all'; // 'single' or 'all'
let currentDisplayMonthIndex = 0; // 表示中の月のインデックス
let holidaysForThisRun = new Set(); // この実行で使われる休日セット

function dateToKey(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; }
function addDays(d,n){ const nd=new Date(d); nd.setDate(nd.getDate()+n); return atMidnight(nd); }
function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    // 月末日の考慮: 2/28に1ヶ月足して3/28になるべきだが、JSは3/31の1ヶ月後を5/1としてしまうことがあるため調整
    if (d.getDate() !== date.getDate()) {
        d.setDate(0); // 前の月の最終日を設定
    }
    return d;
}
function formatMD(d){ return `${d.getMonth()+1}/${d.getDate()}`; }

function renderResult(response, params){
  // 結果とパラメータをグローバル変数に保存
  currentResultData = response;
  currentParams = params;
  calendarDisplayMode = 'all'; // 初期表示は全期間
  currentDisplayMonthIndex = 0; // 休日セットの生成は不要

  // 購入一覧表示
  const purchasePath = response.result.purchasePath;
  // "YYYY-MM-DD (Nヶ月)" という形式の文字列をパースする
  const purchaseItems = purchasePath.split(', ').filter(Boolean).map(itemStr => {
    const match = itemStr.match(/(\d{4}-\d{2}-\d{2})\s*\((\d+)ヶ月\)/);
    if (!match) return null;
    return { date: atMidnight(new Date(match[1])), type: `${match[2]}ヶ月` };
  }).filter(Boolean);

  const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
  let listHTML="";
  purchaseItems.forEach(item => {
    const dateStr = `${item.date.getFullYear()}/${String(item.date.getMonth()+1).padStart(2, '0')}/${String(item.date.getDate()).padStart(2, '0')} (${weekDays[item.date.getDay()]})`;
    listHTML += `<li data-date="${dateToKey(item.date)}" data-type="${item.type}" class="calendar-link-item"><span>${dateStr}</span><strong style="color: var(--accent-color); ">[${item.type}]</strong></li>`;
  });
  document.getElementById("purchaseList").innerHTML=listHTML;

  // グラフ描画
  drawChart();

  // 各購入日へのクリックイベントリスナーを設定
  setupCalendarLinks();

  // カレンダー描画 (アコーディオンが開かれるときに遅延実行される)
  // toggleAccordion(); // 初期表示で開きたい場合はコメントを外す

  // 有料プランの場合は広告を非表示にする
  const adContainer = document.getElementById('ad-container-result');
  if (params.licensePlan && adContainer) {
      adContainer.style.display = 'none';
  }
}

function drawChart() {
  // 棒グラフ計算
  const comparisonCosts = currentResultData.result.comparisonCosts || {};

  // --- ベースラインプランのラベルを決定するロジック ---
  let baselineLabel = Object.keys(comparisonCosts).find(key => key.includes('定期で更新'));
  if (!baselineLabel && currentParams) {
    // キャッシュ利用時など、動的ラベルが見つからない場合はパラメータから再生成
    if (currentParams.sixMonthPass > 0) baselineLabel = '6ヶ月定期で更新';
    else if (currentParams.threeMonthPass > 0) baselineLabel = '3ヶ月定期で更新';
    else if (currentParams.monthlyPass > 0) baselineLabel = '1ヶ月定期で更新';
  }
  if (!baselineLabel) {
      baselineLabel = 'ベースラインプラン';
  }
  
  // comparisonCostsオブジェクトのキーを動的ラベルに統一する
  if (baselineLabel !== 'ベースラインプラン' && comparisonCosts['ベースラインプラン'] !== undefined) {
      comparisonCosts[baselineLabel] = comparisonCosts['ベースラインプラン'];
      delete comparisonCosts['ベースラインプラン'];
  }
  const baselineCostValue = comparisonCosts[baselineLabel];

  const costs = [
    { label: '最適プラン', cost: currentResultData.result.totalCost, color: getComputedStyle(document.documentElement).getPropertyValue('--primary-color') },
  ];
  // '月初'で始まるキーを単純に探す
  const shortestPassOnFirstLabel = Object.keys(comparisonCosts).find(key => key.startsWith('月初'));
  const shortestPassOnFirstCost = comparisonCosts[shortestPassOnFirstLabel];

  // 比較プランが存在する場合のみcosts配列に追加
  if (comparisonCosts['すべて切符で利用']) costs.push({ label: 'すべて切符で利用', cost: comparisonCosts['すべて切符で利用'], color: '#ccc' });
  if (shortestPassOnFirstCost) costs.push({ label: shortestPassOnFirstLabel, cost: shortestPassOnFirstCost, color: '#aaa' });
  if (baselineCostValue) costs.push({ label: baselineLabel, cost: baselineCostValue, color: '#888' });

  // 金額の降順でソート
  costs.sort((a, b) => b.cost - a.cost);

  // 凡例のテキストを動的に更新
  document.getElementById('baselinePlanDescription').innerHTML = `<strong>${baselineLabel}:</strong> あなたが選択した最も期間の長い定期券を、期間が切れるたびに買い続けた場合のコストです。`;
  // 月初購入プランが存在する場合のみ、凡例の説明を表示
  const monthlyOnFirstDesc = document.getElementById('monthlyOnFirstDescription');
  if (shortestPassOnFirstCost) { // ラベルではなくコストの存在で判定
    monthlyOnFirstDesc.innerHTML = `<strong>${shortestPassOnFirstLabel}:</strong> 毎月1日に、あなたが選択した最短期間の定期を買い続けた場合のコストです。`;
    monthlyOnFirstDesc.style.display = 'list-item';
  } else {
    monthlyOnFirstDesc.style.display = 'none';
  }

  const baselineCost = costs.find(c => c.label === baselineLabel)?.cost || 0;
  const optimalCost = costs.find(c => c.label === '最適プラン')?.cost || 0;
  const savings = baselineCost > 0 ? Math.round(baselineCost - optimalCost) : 0;

  // 節約額のラベルも動的に更新
  document.getElementById('savingsLabel').textContent = `${baselineLabel}の金額と比べて...`;
  document.getElementById('savingsAmount').innerHTML = `${savings.toLocaleString()}<span>円</span>`;

  // --- フリープランユーザー向けのプロモーション表示 ---
  const promoBox = document.getElementById('plan-promo');
  if (!currentParams.licensePlan && promoBox) {
    promoBox.style.display = 'block';
    promoBox.innerHTML = `
      今回の節約額は <strong>${savings.toLocaleString()}円</strong> でした！<br>
      <strong>スタンダードプラン (480円/年, 税込)</strong> にアップグレードすると、シミュレーション期間が<strong>最大12ヶ月</strong>に延長されます。より長期のシミュレーションで、さらなる節約を目指しませんか？
    `;
  }
  
  const ctx=document.getElementById('savingsChart').getContext('2d');
  // 既存のチャートがあれば破棄する
  if (myChart) {
    myChart.destroy();
  }

  Chart.register(ChartDataLabels); // データラベルプラグインを登録
  myChart = new Chart(ctx,{
    type: 'bar',
    data:{
      labels: costs.map(c => c.label),
      datasets:[{
        label: '金額(円)',
        data: costs.map(c => c.cost),
        backgroundColor: costs.map(c => c.color),
        barPercentage: 0.6, // バーの太さをカテゴリ幅の60%に設定
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      indexAxis: 'y',
      plugins:{
        datalabels: {
          anchor: 'end', // ラベルをバーの終端（右側）にアンカー
          align: 'start', // ラベルをアンカーポイントの左側に配置
          offset: 4, // バーの内側に4pxオフセット
          clamp: true, // ラベルがグラフ領域からはみ出る場合に、自動的に隠す
          color: 'white', // ラベルの文字色を白に変更
          font: {
            weight: 'bold',
            size: 13,
          },
          formatter: (value) => value.toLocaleString() + '円' // 表示形式をカンマ区切り＋円にする
        },
        legend: { display: false }, // 凡例を非表示にする
        tooltip: { callbacks: { label: (context) => `${context.label}: ${context.raw.toLocaleString()}円` } } 
      },
      scales:{ 
        x: { 
          beginAtZero:true,
          title: { 
            display: true, 
            text: '金額 (円)',
          }
        },
        y: { beginAtZero: true }
      }
    }
  });
}

/**
 * =================================================
 * カレンダー描画用の休日判定ロジック
 * =================================================
 */

/**
 * その月の第何週目かを取得する
 * @param {Date} d - 日付オブジェクト
 * @param {number} weekStartDay - 週の始まりの曜日 (0:日曜, 1:月曜)
 * @returns {number} 週番号
 */
const getWeekNumber = (d, weekStartDay) => {
    const date = d.getDate();
    const day = d.getDay();
    const firstDayOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
    return Math.ceil((date + (firstDayOfMonth - weekStartDay + 7) % 7) / 7);
};

/**
 * index.htmlでの設定に基づいて、特定の日付が休日かどうかを判定する
 * @param {string} dateKey - 'yyyy-MM-dd'形式の日付文字列
 * @param {Date} dateObj - 対応するDateオブジェクト
 * @param {Object} params - index.htmlから渡されたパラメータオブジェクト
 * @returns {boolean} 休日であればtrue
*/
function isHolidayBasedOnParams(dateKey, dateObj, params) {
    if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) return false;

    // localStorage経由で渡された表示用の休日リストを使用
    const calendarHolidaysYmdStr = params.calendarHolidays || '';
    // "yyyy-MM-dd"形式のカンマ区切り文字列を直接Setに変換する
    const holidaysSet = new Set(calendarHolidaysYmdStr.split(','));
    return holidaysSet.has(dateKey);
}

function drawCalendar() {
  if (!currentResultData || !currentParams) return;

  const today = atMidnight(new Date(currentParams.startDate));
  const calendarView = document.getElementById('calendarView');
  calendarView.innerHTML = '';

  if (calendarDisplayMode === 'single') {
    document.getElementById('calendarPagingControls').classList.add('is-visible');
  } else {
    document.getElementById('calendarPagingControls').classList.remove('is-visible');
  }
  document.getElementById('toggleCalendarViewBtn').textContent = calendarDisplayMode === 'single' ? '全期間表示' : '単月表示';

  // --- 描画に必要なデータを準備 ---
  const purchasePath = currentResultData.result.purchasePath;
  const periods = [];
  const purchaseDayKeys = new Set();
  const purchasePathRegex = /(\d{4}-\d{2}-\d{2})\s*\((\d+)ヶ月\)/g;
  let match;
  while ((match = purchasePathRegex.exec(purchasePath)) !== null) {
    const startDate = atMidnight(new Date(match[1]));
    const months = parseInt(match[2], 10);
    const endDate = addDays(addMonths(startDate, months), -1);
    periods.push({ start: startDate, end: endDate });
    purchaseDayKeys.add(dateToKey(startDate));
  }

  // --- 描画対象の月を決定 ---
  const startMonthIndex = calendarDisplayMode === 'single' ? currentDisplayMonthIndex : 0;
  const endMonthIndex = calendarDisplayMode === 'single' ? currentDisplayMonthIndex : currentParams.durationInMonths - 1;

  // --- 週の始まり設定 ---
  const weekStartDay = Number(document.querySelector('input[name="weekStartResult"]:checked').value); // 0:日曜, 1:月曜
  const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
  if (weekStartDay === 1) { weekDays.push(weekDays.shift()); }

  // --- 月ごとにカレンダーを生成 ---
  // シミュレーション終了日を計算
  const simEndDate = addDays(addMonths(today, currentParams.durationInMonths), -1);

  // 描画対象の最初の月から最後の月までループ
  for (let d = new Date(today.getFullYear(), today.getMonth(), 1); d <= simEndDate; d.setMonth(d.getMonth() + 1)) {
    // 単月表示モードのフィルタリング
    if (calendarDisplayMode === 'single' && (d.getFullYear() !== addMonths(today, currentDisplayMonthIndex).getFullYear() || d.getMonth() !== addMonths(today, currentDisplayMonthIndex).getMonth())) {
      continue;
    }
    const year = d.getFullYear();
    const month = d.getMonth();
    
    const monthContainer = document.createElement('div');
    monthContainer.className = 'month-container';
    monthContainer.innerHTML = `
      <div style="font-size: 16px; font-weight: 600; text-align: center; margin-bottom: 8px; color: var(--primary-color);">${year}年 ${month + 1}月</div>
      <div class="week-header">${weekDays.map(w => `<div>${w}</div>`).join('')}</div>
      <div class="calendar-grid"></div>
    `;
    const grid = monthContainer.querySelector('.calendar-grid');

    // 月の最初と最後の日を取得
    const firstDateOfMonth = new Date(year, month, 1);
    const lastDateOfMonth = new Date(year, month + 1, 0);
    
    // カレンダーの開始日を計算（月の1日が始まる前の日曜日または月曜日）
    const calendarStartDate = addDays(firstDateOfMonth, -((firstDateOfMonth.getDay() - weekStartDay + 7) % 7));

    // 6週間分のセルを生成
    for (let i = 0; i < 42; i++) {
      const currentDate = addDays(calendarStartDate, i);
      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      cell.innerHTML = `
        <div class="cell-header"><span class="date-num">${currentDate.getDate()}</span></div>
        <div class="cell-body"><div class="pass-bar"></div></div>
      `;

      // --- セルの状態に応じてクラスを付与 ---
      if (currentDate.getMonth() !== month) {
        cell.classList.add('is-other-month');
      }

      const key = dateToKey(currentDate);
      const isHoliday = isHolidayBasedOnParams(key, currentDate, currentParams);
      if (isHoliday) {
        cell.classList.add('is-holiday');
      }

      if (currentDate.getMonth() === month) {
        let isTicketDay = true;
        for (const { start, end } of periods) {
          if (currentDate >= start && currentDate <= end) {
            isTicketDay = false; // 定期期間なので切符は不要
            const bar = cell.querySelector('.pass-bar');
            bar.classList.add('is-visible');
            if (dateToKey(currentDate) === dateToKey(start)) {
              bar.classList.add('start');
              bar.textContent = '定期';
            }
            if (dateToKey(currentDate) === dateToKey(end)) bar.classList.add('end');
            break;
          }
        }

        // 定期期間外の出勤日を切符の日とする
        // シミュレーション開始日より前の出勤日は切符表示の対象外
        const termEndDate = addDays(addMonths(today, currentParams.durationInMonths), -1);
        if (isTicketDay && !isHoliday && currentDate >= today && currentDate <= termEndDate) {
          cell.querySelector('.cell-body').innerHTML = '<span class="ticket-text">切符</span>';
        }
      }
      grid.appendChild(cell);
    }
    calendarView.appendChild(monthContainer);
  }
}

function toggleAccordion(){
  const content = document.getElementById("calendarContainer");
  const isOpening = content.style.display !== "block";
  content.style.display = isOpening ? "block" : "none";

  // ボタンのテキストを切り替え
  const button = document.getElementById("toggleCalendarBtn");
  button.textContent = isOpening ? "閉じる" : "表示する";

  // アコーディオンを開くときだけ、描画タイミングを少し遅らせてチラつきを防ぐ
  if (isOpening) {
    setTimeout(drawCalendar, 10); // 描画タイミングを少し遅らせる
  }
}

function toggleCalendarView() {
  calendarDisplayMode = (calendarDisplayMode === 'single') ? 'all' : 'single';
  // ボタンのテキストを切り替え
  document.getElementById('toggleCalendarViewBtn').textContent = calendarDisplayMode === 'single' ? '全期間表示' : '単月表示';
  // ページングコントロールの表示を切り替え
  if (calendarDisplayMode === 'single') {
    document.getElementById('calendarPagingControls').classList.add('is-visible');
  } else {
    document.getElementById('calendarPagingControls').classList.remove('is-visible');
  }
  drawCalendar();
}

/**
 * 各購入日のリンクに、Googleカレンダー登録用のクリックイベントを設定する
 */
function setupCalendarLinks() {
  const links = document.querySelectorAll('.calendar-link-item');
  const description = document.getElementById('calendar-link-description');

  if (links.length === 0) {
    if (description) description.style.display = 'none';
    return;
  }

  if (description) description.style.display = 'block';

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault(); // aタグのデフォルトの画面遷移を無効化
      const clickedElement = e.currentTarget; // イベントリスナーが設定されたli要素自体を取得
      const dateKey = clickedElement.dataset.date;
      const passType = clickedElement.dataset.type; // data-type属性を取得
      if (!dateKey || !passType) return;

      // Google Analytics イベントトラッキング
      if (typeof gtag === 'function') gtag('event', 'click_calendar_link');

      const date = new Date(dateKey + 'T00:00:00'); // タイムゾーン問題を避ける

      // 終日イベントとして登録するため、日付をYYYYMMDD形式にフォーマット
      const startDateFmt = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      const endDateFmt = `${nextDay.getFullYear()}${String(nextDay.getMonth() + 1).padStart(2, '0')}${String(nextDay.getDate()).padStart(2, '0')}`;
      const eventTitle = encodeURIComponent(`【TeKeep!】定期券の購入日 (${passType})`);
      const eventDetails = encodeURIComponent('TeKeep!で計算された定期券の購入予定日です。');
      const calendarUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${startDateFmt}/${endDateFmt}&details=${eventDetails}&sf=true&output=xml`;

      window.open(calendarUrl, '_blank');
    });
  });
}


// --- イベントリスナー ---

// ページ読み込み完了時にLocalStorageから結果を読み込んで描画
document.addEventListener('DOMContentLoaded', () => {
  // --- Google Analyticsの動的読み込み (importしたAPP_CONFIGを利用) ---
  if (APP_CONFIG && APP_CONFIG.gaMeasurementId) {
      const gtagScript = document.createElement('script');
      gtagScript.async = true;
      gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${APP_CONFIG.gaMeasurementId}`;
      document.head.appendChild(gtagScript);
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function() { dataLayer.push(arguments); }; // gtagが未定義の場合のフォールバック
      window.gtag('js', new Date());
      window.gtag('config', APP_CONFIG.gaMeasurementId);
  }
  // localStorageから一時的な結果データを取得
  const resultDataString = localStorage.getItem('simulationResultData');

  let resultData = null;
  let paramsData = {}; // 初期値を空のオブジェクトに

  if (resultDataString) {
    // --- データが存在する場合 ---
    const parsedData = JSON.parse(resultDataString);
    resultData = parsedData.resultData;
    paramsData = parsedData.paramsData;

    // 不要になった一時データをlocalStorageから削除
    localStorage.removeItem('simulationResultData');

    // --- パラメータが存在する場合のみ、結果表示処理を実行 ---
    renderResult(resultData, paramsData);
    document.getElementById('resultScreen').style.display = 'block';
    document.getElementById('resultFooter').style.display = 'block';

    // URLから不要なパラメータを削除（リロード対策）
    window.history.replaceState({}, document.title, window.location.pathname);

  } else {
    // --- パラメータがない場合は、エラー画面を表示 ---
    document.getElementById('resultScreen').style.display = 'none';
    document.getElementById('errorScreen').style.display = 'block';
  }

  // 週の始まり設定の読み込み
  const savedWeekStart = localStorage.getItem('weekStartPreference');
  if (savedWeekStart) {
    const radio = document.querySelector(`input[name="weekStartResult"][value="${savedWeekStart}"]`);
    if (radio) {
      radio.checked = true;
    }
  }

  // --- イベントリスナーの登録 ---
  document.getElementById('toggleCalendarBtn').addEventListener('click', toggleAccordion);
  document.getElementById('toggleCalendarViewBtn').addEventListener('click', toggleCalendarView);

  document.getElementById('prevMonthBtn').addEventListener('click', () => {
    if (currentDisplayMonthIndex > 0) {
      currentDisplayMonthIndex--;
      drawCalendar();
    }
  });
  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    // 期間の最終月を超えないように制限
    const simEndDate = addDays(addMonths(new Date(currentParams.startDate), currentParams.durationInMonths), -1);
    const nextMonthDate = addMonths(new Date(currentParams.startDate), currentDisplayMonthIndex + 1);
    // 次の月がシミュレーション終了日を超えていないかチェック
    if (nextMonthDate.getFullYear() < simEndDate.getFullYear() || 
        (nextMonthDate.getFullYear() === simEndDate.getFullYear() && nextMonthDate.getMonth() <= simEndDate.getMonth())) {
      currentDisplayMonthIndex++;
      drawCalendar();
    }
  });
});

// 週の始まりラジオボタンにイベントリスナーを追加
document.querySelectorAll('input[name="weekStartResult"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    localStorage.setItem('weekStartPreference', e.target.value); // 共通キーで設定を保存
    drawCalendar(); // ラジオボタンが変更されたらカレンダーを再描画
  });
});

/**
 * メイン処理を実行する非同期関数
 */
async function main() {
  // --- 1. 設定ファイルの読み込みを待つ ---
  const { APP_CONFIG, APP_ENV } = await configPromise;
  window.APP_CONFIG = APP_CONFIG; // グローバルにも設定
  window.APP_ENV = APP_ENV;

  // --- 2. Google Analyticsの動的読み込み ---
  if (APP_CONFIG.gaMeasurementId) {
      const gtagScript = document.createElement('script');
      gtagScript.async = true;
      gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${APP_CONFIG.gaMeasurementId}`;
      document.head.appendChild(gtagScript);
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function() { dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', APP_CONFIG.gaMeasurementId);
  }

  // --- 3. LocalStorageから結果データを取得して描画 ---
  const resultDataString = localStorage.getItem('simulationResultData');
  if (resultDataString) {
    const parsedData = JSON.parse(resultDataString);
    const resultData = parsedData.resultData;
    const paramsData = parsedData.paramsData;

    localStorage.removeItem('simulationResultData');

    renderResult(resultData, paramsData);
    document.getElementById('resultScreen').style.display = 'block';
    document.getElementById('resultFooter').style.display = 'block';

    window.history.replaceState({}, document.title, window.location.pathname);
  } else {
    document.getElementById('resultScreen').style.display = 'none';
    document.getElementById('errorScreen').style.display = 'block';
  }

  // --- 4. UIの初期化とイベントリスナーの登録 ---
  const savedWeekStart = localStorage.getItem('weekStartPreference');
  if (savedWeekStart) {
    const radio = document.querySelector(`input[name="weekStartResult"][value="${savedWeekStart}"]`);
    if (radio) radio.checked = true;
  }

  document.getElementById('toggleCalendarBtn').addEventListener('click', toggleAccordion);
  document.getElementById('toggleCalendarViewBtn').addEventListener('click', toggleCalendarView);

  document.getElementById('prevMonthBtn').addEventListener('click', () => {
    if (currentDisplayMonthIndex > 0) {
      currentDisplayMonthIndex--;
      drawCalendar();
    }
  });
  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    const simEndDate = addDays(addMonths(new Date(currentParams.startDate), currentParams.durationInMonths), -1);
    const nextMonthDate = addMonths(new Date(currentParams.startDate), currentDisplayMonthIndex + 1);
    if (nextMonthDate.getFullYear() < simEndDate.getFullYear() || 
        (nextMonthDate.getFullYear() === simEndDate.getFullYear() && nextMonthDate.getMonth() <= simEndDate.getMonth())) {
      currentDisplayMonthIndex++;
      drawCalendar();
    }
  });

}

// メイン処理を実行
main();