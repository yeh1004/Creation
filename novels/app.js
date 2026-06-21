/* ==========================================================================
   小說記錄器 - 前端應用邏輯
   ========================================================================== */

// 全局狀態管理
let novelsState = [];
let selectedRating = 10; // 預設評分為 10 分

// DOM 元素選取
const elUrlInput = document.getElementById('novel-url-input');
const elBtnParse = document.getElementById('btn-parse');
const elNovelsList = document.getElementById('novels-list');
const elTotalCount = document.getElementById('total-count');
const elBulkUrlsInput = document.getElementById('bulk-urls-input');
const elBtnBulkImport = document.getElementById('btn-bulk-import');

// Modal DOM
const elModal = document.getElementById('novel-modal');
const elModalHeading = document.getElementById('modal-heading');
const elModalNovelId = document.getElementById('modal-novel-id');
const elModalTitleInput = document.getElementById('modal-title-input');
const elModalAuthorInput = document.getElementById('modal-author-input');
const elModalUrlInput = document.getElementById('modal-url-input');
const elModalStarRating = document.getElementById('modal-star-rating');
const elRatingNumberVal = document.getElementById('rating-number-val');
const elBtnSaveNovel = document.getElementById('btn-save-novel');
const elBtnCancelModal = document.getElementById('btn-cancel-modal');
const elBtnCloseModal = document.getElementById('btn-close-modal');

/* ==========================================================================
   初始化與事件綁定
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    fetchNovels();
    initModalStars();
    
    // 頁籤切換邏輯
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.add('hidden'));
            
            btn.classList.add('active');
            const targetTab = btn.dataset.tab;
            document.getElementById(targetTab).classList.remove('hidden');
        });
    });

    // 按鈕：解析網址
    elBtnParse.addEventListener('click', handleParseUrl);
    elUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleParseUrl();
    });
    
    // 批量匯入按鈕
    elBtnBulkImport.addEventListener('click', handleBulkImport);
    
    // Modal 關閉事件
    elBtnCancelModal.addEventListener('click', closeModal);
    elBtnCloseModal.addEventListener('click', closeModal);
    elModal.addEventListener('click', (e) => {
        if (e.target === elModal) closeModal();
    });
    
    // Modal 儲存按鈕
    elBtnSaveNovel.addEventListener('click', saveNovelData);
});

/* ==========================================================================
   星等選擇互動邏輯 (Star Rating UI)
   ========================================================================== */
function initModalStars() {
    const starItems = elModalStarRating.querySelectorAll('.star-item');
    
    starItems.forEach(star => {
        // 滑鼠移入：暫時高亮
        star.addEventListener('mouseenter', () => {
            const val = parseInt(star.dataset.val);
            highlightStars(val);
        });
        
        // 滑鼠移出：還原為當前選擇值
        star.addEventListener('mouseleave', () => {
            highlightStars(selectedRating);
        });
        
        // 點擊星等：確立數值
        star.addEventListener('click', () => {
            selectedRating = parseInt(star.dataset.val);
            elRatingNumberVal.textContent = selectedRating;
            highlightStars(selectedRating);
        });
    });
    
    // 初始化為預設值
    setModalRating(selectedRating);
}

function highlightStars(val) {
    const starItems = elModalStarRating.querySelectorAll('.star-item');
    starItems.forEach(star => {
        const starVal = parseInt(star.dataset.val);
        if (starVal <= val) {
            star.classList.add('selected');
        } else {
            star.classList.remove('selected');
        }
    });
}

function setModalRating(val) {
    selectedRating = val;
    elRatingNumberVal.textContent = val;
    highlightStars(val);
}

/* ==========================================================================
   API 通訊與 CRUD 操作
   ========================================================================== */

// 1. 取得小說列表
async function fetchNovels() {
    try {
        const res = await fetch('/api/novels');
        if (!res.ok) throw new Error('無法取得小說資料');
        novelsState = await res.json();
        renderNovelsList();
    } catch (err) {
        showToast(`錯誤: ${err.message}`, 'error');
    }
}

// 2. 爬取解析網址
async function handleParseUrl() {
    const url = elUrlInput.value.trim();
    if (!url) {
        showToast('請貼上小說網址', 'warning');
        return;
    }
    
    // 簡單網址格式基本驗證
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        showToast('網址格式不正確，必須以 http:// 或 https:// 開頭', 'warning');
        return;
    }
    
    setLoadingState(true);
    
    try {
        const encodeUrl = encodeURIComponent(url);
        const res = await fetch(`/api/scrape?url=${encodeUrl}`);
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || '解析失敗');
        }
        
        // 成功解析後，開啟 Modal 讓使用者確認/評分
        openModal({
            id: '',
            title: data.title || '',
            author: data.author || '',
            url: url,
            rating: 10 // 新增預設給 10 分
        }, '新增小說紀錄');
        
        showToast('網址解析成功！請填寫評分並確認儲存。', 'success');
        elUrlInput.value = ''; // 清空輸入框
    } catch (err) {
        showToast(`無法自動解析該網站。請手動輸入小說資訊。`, 'warning');
        // 自動解析失敗依然開啟 Modal 讓使用者手動輸入
        openModal({
            id: '',
            title: '',
            author: '',
            url: url,
            rating: 10
        }, '手動新增小說紀錄');
    } finally {
        setLoadingState(false);
    }
}

// 2.5 批量匯入網址
async function handleBulkImport() {
    const rawInput = elBulkUrlsInput.value.trim();
    if (!rawInput) {
        showToast('請貼上小說網址', 'warning');
        return;
    }
    
    // 按換行分割並過濾空值與非法格式
    const urls = rawInput.split('\n')
        .map(u => u.trim())
        .filter(u => u.length > 0 && (u.startsWith('http://') || u.startsWith('https://')));
        
    if (urls.length === 0) {
        showToast('無有效的網址（網址必須以 http:// 或 https:// 開頭）', 'warning');
        return;
    }
    
    setBulkLoadingState(true);
    
    try {
        const res = await fetch('/api/novels/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '匯入失敗');
        
        showToast(`成功批量匯入 ${data.length} 本小說紀錄！`, 'success');
        elBulkUrlsInput.value = ''; // 清空輸入框
        fetchNovels(); // 重新載入列表
    } catch (err) {
        showToast(`批量匯入失敗: ${err.message}`, 'error');
    } finally {
        setBulkLoadingState(false);
    }
}

// 控制批量按鈕載入狀態
function setBulkLoadingState(isLoading) {
    const elSpinner = elBtnBulkImport.querySelector('.spinner');
    const elText = elBtnBulkImport.querySelector('.btn-text');
    
    if (isLoading) {
        elBtnBulkImport.disabled = true;
        elSpinner.classList.remove('hidden');
        elText.textContent = '匯入中...';
    } else {
        elBtnBulkImport.disabled = false;
        elSpinner.classList.add('hidden');
        elText.textContent = '開始匯入';
    }
}

// 3. 儲存/新增小說紀錄
async function saveNovelData() {
    const novelId = elModalNovelId.value;
    const title = elModalTitleInput.value.trim();
    const author = elModalAuthorInput.value.trim();
    const url = elModalUrlInput.value.trim();
    
    if (!title) {
        showToast('請輸入小說名稱', 'warning');
        return;
    }
    
    const payload = {
        title,
        author: author || '未知作者',
        url,
        rating: selectedRating
    };
    
    try {
        let res;
        if (novelId) {
            // 編輯修改
            res = await fetch(`/api/novels/${novelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            // 新增
            res = await fetch('/api/novels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '儲存失敗');
        
        showToast(novelId ? '修改成功！' : '新增成功！', 'success');
        closeModal();
        fetchNovels(); // 重新取得最新列表並渲染
    } catch (err) {
        showToast(`儲存錯誤: ${err.message}`, 'error');
    }
}

// 4. 刪除小說紀錄
async function deleteNovel(id) {
    if (!confirm('您確定要刪除此本小說的記錄嗎？')) return;
    
    try {
        const res = await fetch(`/api/novels/${id}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || '刪除失敗');
        
        showToast('已刪除該小說紀錄', 'success');
        fetchNovels();
    } catch (err) {
        showToast(`刪除失敗: ${err.message}`, 'error');
    }
}

/* ==========================================================================
   前端渲染與 UI 控制
   ========================================================================== */

// 渲染小說列表
function renderNovelsList() {
    // 依評分高低（降冪）排序，同分時依加入時間（降冪，最新加入在最前）排序
    const sortedNovels = [...novelsState].sort((a, b) => {
        if (b.rating !== a.rating) {
            return b.rating - a.rating; // 評分高到低
        }
        // 同分時，時間新到舊 (createdAt 降冪)
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    // 更新小說總量統計
    elTotalCount.textContent = sortedNovels.length;
    
    if (sortedNovels.length === 0) {
        elNovelsList.innerHTML = `
            <div class="empty-state glass-panel">
                <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                </svg>
                <p>目前還沒有任何小說紀錄</p>
                <span>請在上方輸入網址並點選「自動解析」來新增第一本小說。</span>
            </div>
        `;
        return;
    }
    
    elNovelsList.innerHTML = sortedNovels.map(novel => {
        const formattedDate = formatDate(novel.createdAt);
        const titleHtml = novel.url 
            ? `<a href="${escapeHtml(novel.url)}" target="_blank" class="novel-link" title="前往閱讀小說頁面"><h2 class="novel-title">${escapeHtml(novel.title)}</h2></a>`
            : `<h2 class="novel-title">${escapeHtml(novel.title)}</h2>`;
            
        return `
            <article class="novel-card glass-panel" data-id="${novel.id}">
                <div class="card-header">
                    <div class="card-title-group">
                        ${titleHtml}
                        <div class="novel-author">
                            <svg class="author-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                            <span>${escapeHtml(novel.author)}</span>
                        </div>
                    </div>
                    ${novel.rating === 0 
                        ? `<div class="rating-badge unrated" title="尚未評分">—</div>` 
                        : `<div class="rating-badge" title="評分：${novel.rating}分">${novel.rating}</div>`
                    }
                </div>
                <div class="card-footer">
                    <span class="join-time">加入於 ${formattedDate}</span>
                    <div class="card-actions">
                        <button class="action-btn edit-btn" onclick="editNovel('${novel.id}')" title="修改內容">
                            <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="action-btn delete-btn" onclick="deleteNovel('${novel.id}')" title="刪除紀錄">
                            <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

// 編輯小說按鈕點擊處理
window.editNovel = function(id) {
    const novel = novelsState.find(n => n.id === id);
    if (!novel) return;
    
    openModal(novel, '修改小說資訊');
};

// 開啟 Modal 彈窗
function openModal(data, heading = '編輯小說') {
    elModalHeading.textContent = heading;
    elModalNovelId.value = data.id || '';
    elModalTitleInput.value = data.title || '';
    elModalAuthorInput.value = data.author || '';
    elModalUrlInput.value = data.url || '';
    
    setModalRating(data.rating || 10);
    
    elModal.classList.remove('hidden');
}

// 關閉 Modal 彈窗
function closeModal() {
    elModal.classList.add('hidden');
    // 清空表單欄位以防殘留
    elModalNovelId.value = '';
    elModalTitleInput.value = '';
    elModalAuthorInput.value = '';
    elModalUrlInput.value = '';
    setModalRating(10);
}

// 設定載入中狀態
function setLoadingState(isLoading) {
    const elSpinner = elBtnParse.querySelector('.spinner');
    const elText = elBtnParse.querySelector('.btn-text');
    
    if (isLoading) {
        elBtnParse.disabled = true;
        elSpinner.classList.remove('hidden');
        elText.textContent = '解析中...';
    } else {
        elBtnParse.disabled = false;
        elSpinner.classList.add('hidden');
        elText.textContent = '自動解析';
    }
}

/* ==========================================================================
   輔助工具函數 (Utility Functions)
   ========================================================================== */

// 格式化 ISO 日期
function formatDate(isoString) {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '';
        
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d} ${hh}:${mm}`;
    } catch (e) {
        return '';
    }
}

// 防止 HTML 注入的安全編碼
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Toast 提示訊息彈窗
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // 設定不同類型的圖示
    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'warning' || type === 'error') {
        iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    }
    
    toast.innerHTML = `${iconSvg} <span>${message}</span>`;
    container.appendChild(toast);
    
    // 3.5秒後自動從 DOM 移除
    setTimeout(() => {
        toast.remove();
    }, 3500);
}
