// ==UserScript==
// @name         月下人狼 普村狼助理
// @namespace    https://github.com/hebaiser/werewolf-helper
// @version      0.1.9
// @description  玩家侧边栏：身份轮换/视角切换/占卜记录/灰区标记/导出表格/设置面板
// @author       hbser
// @match        https://www.werewolf.com.cn/room/*
// @grant        GM_setValue
// @grant        GM_getValue
// @license      GPL-3.0
// @downloadURL https://update.greasyfork.org/scripts/592666/%E6%9C%88%E4%B8%8B%E4%BA%BA%E7%8B%BC%20%E6%99%AE%E6%9D%91%E7%8B%BC%E5%8A%A9%E7%90%86.user.js
// @updateURL https://update.greasyfork.org/scripts/592666/%E6%9C%88%E4%B8%8B%E4%BA%BA%E7%8B%BC%20%E6%99%AE%E6%9D%91%E7%8B%BC%E5%8A%A9%E7%90%86.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    // 0. 房间号
    // ============================================================

    function getRoomId() {
        const match = window.location.pathname.match(/\/room\/(\d+)/);
        return match ? match[1] : 'default';
    }
    const ROOM_ID = getRoomId();

    // ============================================================
    // 1. 存储
    // ============================================================

    const SETTINGS_KEY = 'werewolf_settings_v1';

    const defaultSettings = {
        theme: 'dark',
        position: 'left',
        width: 'medium',
        baseFontSize: 11,
        autoShrink: true,
        shrinkThresholds: {
            '11': 18,
            '10': 22,
            '9': 26,
            '8': Infinity
        },
        shrinkMin: 8,
        deathOpacity: 0.5,
        colors: {
            dark: {
                bg: '#1e1e28',
                text: '#e0e0e0',
                textSecondary: '#8888aa',
                border: '#4a4a6a',
                divider: '#4a4a6a',
                highlight: 'rgba(100,200,255,0.12)',
                hover: 'rgba(100,200,255,0.06)',
                mark: '#ffaa66',
                view: '#66ddff'
            },
            light: {
                bg: '#e8e8ee',
                text: '#1a1a2e',
                textSecondary: '#444466',
                border: '#8888bb',
                divider: '#8888bb',
                highlight: 'rgba(50,100,200,0.20)',
                hover: 'rgba(50,100,200,0.10)',
                mark: '#cc8833',
                view: '#2288bb'
            }
        },
        jobColorPreset: 'classic',
        jobColors: {},
        perspective: null,
        collapsed: false,
        operationMode: 'quick',
        showPreview: false,
        showCommonGray: false,
        showIndependentGray: false,
        previewOpacity: 0.9,
        previewSize: 'medium',
        previewPosition: null
    };

    function getSettings() {
        try {
            const stored = GM_getValue(SETTINGS_KEY, null);
            if (!stored) return JSON.parse(JSON.stringify(defaultSettings));
            const merged = JSON.parse(JSON.stringify(defaultSettings));
            for (const key in stored) {
                if (stored.hasOwnProperty(key) && merged.hasOwnProperty(key)) {
                    if (typeof stored[key] === 'object' && stored[key] !== null && !Array.isArray(stored[key])) {
                        merged[key] = { ...merged[key], ...stored[key] };
                    } else {
                        merged[key] = stored[key];
                    }
                }
            }
            if (merged.baseFontSize) {
                merged.baseFontSize = Number(merged.baseFontSize) || 11;
            }
            for (const key in defaultSettings) {
                if (!(key in merged)) {
                    merged[key] = defaultSettings[key];
                }
            }
            return merged;
        } catch (e) {
            console.warn('读取设置失败，使用默认设置', e);
            return JSON.parse(JSON.stringify(defaultSettings));
        }
    }

    function saveSettings(settings) {
        try {
            GM_setValue(SETTINGS_KEY, settings);
        } catch (e) {
            console.warn('保存设置失败', e);
            showToast('保存设置失败，请检查存储空间', 2000);
        }
    }

    const store = {
        get() {
            try {
                const all = GM_getValue('werewolf_notes_v29', {});
                if (!all[ROOM_ID]) {
                    all[ROOM_ID] = { identity: {}, action: {}, jobColors: {} };
                }
                return all[ROOM_ID];
            } catch (e) {
                console.warn('读取存储数据失败', e);
                return { identity: {}, action: {}, jobColors: {} };
            }
        },
        set(data) {
            try {
                const all = GM_getValue('werewolf_notes_v29', {});
                all[ROOM_ID] = data;
                GM_setValue('werewolf_notes_v29', all);
            } catch (e) {
                console.warn('保存存储数据失败', e);
                showToast('保存数据失败，请检查存储空间', 2000);
            }
        },
        getIdentity(perspectiveId, playerId) {
            const data = this.get();
            if (!data.identity[perspectiveId]) return null;
            return data.identity[perspectiveId][playerId] || null;
        },
        setIdentity(perspectiveId, playerId, job) {
            const data = this.get();
            if (!data.identity[perspectiveId]) data.identity[perspectiveId] = {};
            if (job === null) {
                delete data.identity[perspectiveId][playerId];
            } else {
                data.identity[perspectiveId][playerId] = job;
            }
            this.set(data);
        },
        getAction(operatorId) {
            const data = this.get();
            if (!data.action[operatorId]) {
                return { targets: [], death: null };
            }
            return data.action[operatorId];
        },
        getActionTarget(operatorId, targetName) {
            const data = this.get();
            if (!data.action[operatorId]) return null;
            const actionData = data.action[operatorId];
            if (actionData.targets) {
                const entry = actionData.targets.find(t => t.target === targetName);
                if (entry) return entry.symbol;
            }
            if (targetName === '自己' && actionData.death) {
                return actionData.death;
            }
            return null;
        },
        setAction(operatorId, targetName, symbol) {
            const data = this.get();
            if (!data.action[operatorId]) {
                data.action[operatorId] = { targets: [], death: null };
            }
            const actionData = data.action[operatorId];

            if (targetName === '自己') {
                if (symbol === null) {
                    actionData.death = null;
                } else {
                    actionData.death = symbol;
                }
            } else {
                if (symbol === null) {
                    actionData.targets = actionData.targets.filter(
                        entry => entry.target !== targetName
                    );
                } else {
                    const existing = actionData.targets.find(
                        entry => entry.target === targetName
                    );
                    if (existing) {
                        existing.symbol = symbol;
                    } else {
                        actionData.targets.push({ target: targetName, symbol: symbol });
                    }
                }
            }
            this.set(data);
        },
        clearAction(operatorId) {
            const data = this.get();
            if (data.action[operatorId]) {
                data.action[operatorId] = { targets: [], death: null };
            }
            this.set(data);
        },
        setJobColors(colors) {
            const data = this.get();
            data.jobColors = colors;
            this.set(data);
        },
        getJobColors() {
            return this.get().jobColors || {};
        },
        clearAll() {
            try {
                const all = GM_getValue('werewolf_notes_v29', {});
                all[ROOM_ID] = { identity: {}, action: {}, jobColors: {} };
                GM_setValue('werewolf_notes_v29', all);
            } catch (e) {
                console.warn('清除数据失败', e);
                showToast('清除数据失败', 1500);
            }
        },
        clearRoomData() {
            try {
                const all = GM_getValue('werewolf_notes_v29', {});
                delete all[ROOM_ID];
                GM_setValue('werewolf_notes_v29', all);
                showToast('当前房间数据已清除', 1500);
            } catch (e) {
                console.warn('清除房间数据失败', e);
                showToast('清除失败', 1500);
            }
        }
    };

    // ============================================================
    // 2. 颜色
    // ============================================================

    function generateJobColors(jobList) {
        const colors = {};
        const goldenRatio = 0.618033988749895;
        jobList.forEach((job, i) => {
            colors[job] = `hsl(${(i * goldenRatio * 360) % 360}, 80%, 55%)`;
        });
        return colors;
    }

    const PRESET_JOB_COLORS = {
        dark: {
            classic: {
                '村人': '#888888',
                '占卜师': '#44ddff',
                '灵能者': '#66ff99',
                '人狼': '#ff4444',
                '狂人': '#ff88bb',
                '妖狐': '#dd77ff',
                '猎人': '#ffaa44',
                '共有者': '#ffdd44',
                '面包店': '#66ddbb'
            },
            soft: {
                '村人': '#999999',
                '占卜师': '#77ddee',
                '灵能者': '#88dd99',
                '人狼': '#dd6666',
                '狂人': '#dd99bb',
                '妖狐': '#cc88dd',
                '猎人': '#dd9944',
                '共有者': '#ddcc55',
                '面包店': '#66ccaa'
            },
            highcontrast: {
                '村人': '#aaaaaa',
                '占卜师': '#00ddff',
                '灵能者': '#00ff66',
                '人狼': '#ff0000',
                '狂人': '#ff44aa',
                '妖狐': '#dd44ff',
                '猎人': '#ff8800',
                '共有者': '#ffee00',
                '面包店': '#00dd99'
            },
            colorblind: {
                '村人': '#aaaaaa',
                '占卜师': '#0088dd',
                '灵能者': '#55bb77',
                '人狼': '#dd4411',
                '狂人': '#dd77aa',
                '妖狐': '#9966dd',
                '猎人': '#dd9900',
                '共有者': '#55aa88',
                '面包店': '#bbbb44'
            }
        },
        light: {
            classic: {
                '村人': '#777777',
                '占卜师': '#0088cc',
                '灵能者': '#22aa66',
                '人狼': '#cc2222',
                '狂人': '#dd5599',
                '妖狐': '#bb44dd',
                '猎人': '#dd7700',
                '共有者': '#ccaa00',
                '面包店': '#22aa88'
            },
            soft: {
                '村人': '#888888',
                '占卜师': '#4488aa',
                '灵能者': '#55aa77',
                '人狼': '#aa5555',
                '狂人': '#bb7799',
                '妖狐': '#aa66bb',
                '猎人': '#bb7733',
                '共有者': '#bbaa44',
                '面包店': '#44aa88'
            },
            highcontrast: {
                '村人': '#999999',
                '占卜师': '#0066cc',
                '灵能者': '#00aa44',
                '人狼': '#cc0000',
                '狂人': '#dd3388',
                '妖狐': '#bb22dd',
                '猎人': '#cc6600',
                '共有者': '#ccaa00',
                '面包店': '#00aa77'
            },
            colorblind: {
                '村人': '#888888',
                '占卜师': '#0066bb',
                '灵能者': '#338855',
                '人狼': '#bb3300',
                '狂人': '#bb5588',
                '妖狐': '#7744bb',
                '猎人': '#bb7700',
                '共有者': '#338866',
                '面包店': '#999933'
            }
        }
    };

    function getPresetJobColors(presetName, theme) {
        const themeKey = theme === 'light' ? 'light' : 'dark';
        const themePresets = PRESET_JOB_COLORS[themeKey] || PRESET_JOB_COLORS.dark;
        return themePresets[presetName] || themePresets.classic;
    }

    function getJobColor(job, settings) {
        if (!job) return '#888';
        const theme = settings.theme === 'system'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : settings.theme;
        if (settings.jobColorPreset === 'custom') {
            const userColors = settings.jobColors || {};
            if (userColors[job]) return userColors[job];
        }
        const preset = getPresetJobColors(settings.jobColorPreset || 'classic', theme);
        if (preset[job]) return preset[job];
        const storeColors = store.getJobColors();
        if (storeColors[job]) return storeColors[job];
        return '#888';
    }

    // ============================================================
    // 3. 查找玩家（已修复：匹配所有死亡消息格式）
    // ============================================================

    function findPlayers() {
        const players = [];
        const seen = new Set();

        // ★ 第一步：从日志中提取死亡玩家名字（匹配所有死因格式） ★
        const deadNamesFromLog = new Set();
        const logEntries = document.querySelectorAll('.jf-log, .sc-feJyhm, [class*="log"]');
        for (const entry of logEntries) {
            const text = entry.textContent || '';
            // 匹配月下人狼所有死亡消息格式
            const match = text.match(/([^\s]+)\s+(?:不成样子的尸体被发现了|被咒杀了|被处刑了|离开了村子|的尸体被发现了|追随着某个人自尽了|衰老而死了|被猎枪射杀了|被GM处死了|因为没有及时投票猝死了|因为没有及时使用夜间技能猝死了)/);
            if (match) {
                deadNamesFromLog.add(match[1]);
            }
        }

        // ★ 第二步：从死亡图标提取死亡ID ★
        const deadIds = new Set();
        const deathImgs = document.querySelectorAll('img[alt="死亡"]');
        for (const img of deathImgs) {
            let parent = img.parentElement;
            let found = false;
            for (let i = 0; i < 8 && parent && parent !== document.body; i++) {
                const link = parent.querySelector('a[href^="/user/"]');
                if (link) {
                    const href = link.getAttribute('href');
                    const id = href.replace(/.*\/user\//, '').split('?')[0];
                    if (id) {
                        deadIds.add(id);
                        found = true;
                        break;
                    }
                }
                parent = parent.parentElement;
            }
            if (!found) {
                const siblings = img.parentElement.querySelectorAll('a[href^="/user/"]');
                for (const link of siblings) {
                    const href = link.getAttribute('href');
                    const id = href.replace(/.*\/user\//, '').split('?')[0];
                    if (id) {
                        deadIds.add(id);
                        break;
                    }
                }
            }
        }

        // ★ 第三步：遍历所有玩家链接 ★
        const links = document.querySelectorAll('a[href^="/user/"]');
        for (const link of links) {
            const href = link.getAttribute('href');
            const id = href.replace(/.*\/user\//, '').split('?')[0];
            if (!id || seen.has(id)) continue;
            const name = link.textContent.trim();
            if (!name || name.includes('游戏管理员') || name === '游戏管理员') continue;
            seen.add(id);

            // ★ 综合判断死亡：死亡图标 OR 日志记录 OR 替身君 ★
            const isDead = deadIds.has(id) || deadNamesFromLog.has(name) || name === '替身君';
            players.push({ id, name, isDead });
        }

        return players;
    }

    // ============================================================
    // 4. 提取职业
    // ============================================================

    function extractJobList() {
        const order = [];
        const skip = ['昼', '夜', '犹豫', '投票', '时间', '阶段', '规则', '说明'];
        const logs = document.querySelectorAll('.jf-log, .sc-feJyhm, [class*="log"]');
        for (const entry of logs) {
            const text = entry.textContent || '';
            if (!text.includes('配置:')) continue;
            let m = text.match(/配置:\s*([\s\S]+?)(?:\n|$)/);
            if (m) {
                const parts = m[1].trim().split(/\s+/);
                for (const p of parts) {
                    const jm = p.match(/^([^\d]+)(\d+)$/);
                    if (jm) {
                        const name = jm[1].trim();
                        if (!skip.some(w => name.includes(w)) && !order.includes(name)) {
                            order.push(name);
                        }
                    }
                }
                const idx = order.indexOf('村人');
                if (idx > -1) { order.splice(idx, 1); order.push('村人'); }
                if (order.length > 0) return order;
            }
            m = text.match(/配置:\s*\/(.+?)(?:\n|$)/);
            if (m) {
                const parts = m[1].trim().split('/');
                for (const p of parts) {
                    const jm = p.match(/^([^\d]+)(\d+)$/);
                    if (jm) {
                        const name = jm[1].trim();
                        if (!skip.some(w => name.includes(w)) && !order.includes(name)) {
                            order.push(name);
                        }
                    }
                }
                const idx = order.indexOf('村人');
                if (idx > -1) { order.splice(idx, 1); order.push('村人'); }
                if (order.length > 0) return order;
            }
        }
        const table = document.querySelector('.sc-lhVmIH, table.roles, [class*="rule"]');
        if (table) {
            const rows = table.querySelectorAll('tr');
            for (const row of rows) {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    const name = cells[0].textContent.trim();
                    const count = parseInt(cells[1].textContent.trim()) || 0;
                    if (count > 0 && !skip.some(w => name.includes(w)) && !order.includes(name) && name !== '村人') {
                        order.push(name);
                    }
                }
            }
            if (!order.includes('村人')) order.push('村人');
        }
        if (order.length === 0) {
            order.push('村人', '占卜师', '灵能者', '人狼');
        }
        return order;
    }

    // ============================================================
    // 5. 循环函数
    // ============================================================

    function getNextJob(current, direction) {
        if (cachedJobList.length === 0) return null;
        const list = [...cachedJobList, null];
        if (current === undefined || current === null) {
            return direction > 0 ? list[0] : list[list.length - 2];
        }
        const idx = list.indexOf(current);
        if (idx === -1) return list[0];
        let newIdx = idx + direction;
        if (newIdx < 0) newIdx = list.length - 1;
        if (newIdx >= list.length) newIdx = 0;
        return list[newIdx];
    }

    function getNextDivine(current, direction) {
        const list = ['○', '●', null];
        if (current === undefined || current === null) {
            return direction > 0 ? list[0] : list[list.length - 2];
        }
        const idx = list.indexOf(current);
        if (idx === -1) return list[0];
        let newIdx = idx + direction;
        if (newIdx < 0) newIdx = list.length - 1;
        if (newIdx >= list.length) newIdx = 0;
        return list[newIdx];
    }

    function getNextResult(current, direction) {
        const list = ['×（处刑）', '×（夜死）', null];
        if (current === undefined || current === null) {
            return direction > 0 ? list[0] : list[list.length - 2];
        }
        const idx = list.indexOf(current);
        if (idx === -1) return list[0];
        let newIdx = idx + direction;
        if (newIdx < 0) newIdx = list.length - 1;
        if (newIdx >= list.length) newIdx = 0;
        return list[newIdx];
    }

    // ============================================================
    // 6. 全局状态
    // ============================================================

    let settings = getSettings();
    let currentPerspective = settings.perspective || null;
    let isCollapsed = settings.collapsed || false;
    let cachedPlayers = [];
    let cachedJobList = [];
    let expandBtn = null;
    let toastTimer = null;
    let isSettingsDirty = false;
    let settingsModal = null;
    let pendingSettings = null;
    let longPressTimer = null;
    let isLongPress = false;
    let previewWindow = null;
    let previewBlocks = [];
    const LONG_PRESS_DELAY = 800;

    // ============================================================
    // 7. Toast
    // ============================================================

    function showToast(msg, duration) {
        duration = duration || 2000;
        const existing = document.getElementById('werewolf-toast');
        if (existing) existing.remove();
        if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
        const toast = document.createElement('div');
        toast.id = 'werewolf-toast';
        toast.style.cssText = `
            position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
            background:rgba(30,30,40,0.92);
            color:#e0e0e0;padding:6px 16px;border-radius:4px;
            font-size:12px;font-family:'Microsoft YaHei',sans-serif;
            z-index:10001;border:1px solid #4a4a6a;
            pointer-events:none;transition:opacity 0.2s;
        `;
        toast.textContent = msg;
        document.body.appendChild(toast);
        toastTimer = setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
            toastTimer = null;
        }, duration);
    }

    // ============================================================
    // 8. 获取当前主题颜色
    // ============================================================

    function getCurrentTheme(settings) {
        if (settings.theme === 'system') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return settings.theme;
    }

    function getThemeColors(settings) {
        const theme = getCurrentTheme(settings);
        return settings.colors[theme] || settings.colors.dark;
    }

    // ============================================================
    // 9. 应用设置到侧栏
    // ============================================================

    function applySettingsToSidebar(settingsOverride) {
        const s = document.getElementById('werewolf-sidebar');
        if (!s) return;
        const activeSettings = settingsOverride || settings;
        const theme = getCurrentTheme(activeSettings);
        const themeColors = getThemeColors(activeSettings);
        s.style.background = themeColors.bg;
        s.style.color = themeColors.text;
        s.style.borderColor = themeColors.border;
        const titleBar = document.getElementById('werewolf-titlebar');
        if (titleBar) {
            titleBar.style.color = themeColors.text;
            titleBar.style.borderBottomColor = themeColors.divider;
        }
        const toolbar = document.getElementById('werewolf-toolbar');
        if (toolbar) {
            toolbar.style.borderTopColor = themeColors.divider;
            const buttons = toolbar.querySelectorAll('button');
            const isDark = theme === 'dark';
            buttons.forEach(btn => {
                btn.style.color = themeColors.textSecondary;
                btn.style.borderColor = themeColors.border;
                btn.style.background = isDark ? 'rgba(60,60,80,0.5)' : 'rgba(200,200,215,0.5)';
                btn.style.height = '22px';
                btn.style.lineHeight = '22px';
            });
        }
        const ind = document.getElementById('perspective-indicator');
        if (ind) {
            ind.style.color = currentPerspective ? themeColors.view : themeColors.mark;
        }
        const widthMap = { small: '140px', medium: '180px', large: '220px' };
        if (!isCollapsed) {
            s.style.width = widthMap[activeSettings.width] || '180px';
        }
        if (activeSettings.position === 'right') {
            s.style.left = 'auto';
            s.style.right = '0';
            s.style.borderRadius = '6px 0 0 6px';
            s.style.borderRight = 'none';
            s.style.borderLeft = `2px solid ${themeColors.border}`;
            if (expandBtn) {
                expandBtn.style.left = 'auto';
                expandBtn.style.right = '0';
                expandBtn.style.borderRadius = '4px 0 0 4px';
                expandBtn.style.borderLeft = `1px solid ${themeColors.border}`;
                expandBtn.style.borderRight = 'none';
            }
        } else {
            s.style.left = '0';
            s.style.right = 'auto';
            s.style.borderRadius = '0 6px 6px 0';
            s.style.borderRight = `2px solid ${themeColors.border}`;
            s.style.borderLeft = 'none';
            if (expandBtn) {
                expandBtn.style.left = '0';
                expandBtn.style.right = 'auto';
                expandBtn.style.borderRadius = '0 4px 4px 0';
                expandBtn.style.borderRight = `1px solid ${themeColors.border}`;
                expandBtn.style.borderLeft = 'none';
            }
        }
        if (cachedPlayers.length > 0) {
            renderPlayerList(cachedPlayers, activeSettings);
        }
        if (expandBtn) {
            expandBtn.style.background = themeColors.bg;
            expandBtn.style.color = themeColors.text;
            expandBtn.style.borderColor = themeColors.border;
        }
    }

    // ============================================================
    // 10. 计算行高
    // ============================================================

    function calcLineHeight(playerCount, fontSize, containerHeight) {
        const baseLineHeight = fontSize + 4;
        const maxHeight = containerHeight || 300;
        const totalContentHeight = playerCount * baseLineHeight;
        if (totalContentHeight <= maxHeight) {
            return baseLineHeight;
        }
        const scale = maxHeight / totalContentHeight;
        const minLineHeight = fontSize + 1;
        const newLineHeight = Math.max(minLineHeight, Math.round(baseLineHeight * scale));
        return Math.max(newLineHeight, minLineHeight);
    }

    // ============================================================
    // 11. 设置面板
    // ============================================================

    function openSettings() {
        if (settingsModal) {
            settingsModal.style.display = 'block';
            return;
        }
        pendingSettings = JSON.parse(JSON.stringify(settings));
        isSettingsDirty = false;
        const overlay = document.createElement('div');
        overlay.id = 'werewolf-settings-overlay';
        overlay.style.cssText = `
            position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,0.6);
            z-index:10002;
            display:flex;justify-content:center;align-items:center;
        `;
        const modal = document.createElement('div');
        modal.id = 'werewolf-settings-modal';
        const themeColors = getThemeColors(settings);
        modal.style.cssText = `
            background:${themeColors.bg};
            color:${themeColors.text};
            border-radius:12px;
            padding:24px 28px;
            max-width:620px;
            width:90%;
            max-height:85vh;
            overflow-y:auto;
            font-family:'Microsoft YaHei',sans-serif;
            font-size:13px;
            box-shadow:0 20px 60px rgba(0,0,0,0.5);
            border:1px solid ${themeColors.border};
            position:relative;
        `;
        let titleText = '设置';
        if (isSettingsDirty) titleText += ' *';
        modal.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid ${themeColors.divider};padding-bottom:12px;">
                <h2 id="settings-title" style="margin:0;font-size:16px;font-weight:bold;">${titleText}</h2>
                <button id="settings-close-btn" style="background:none;border:none;color:${themeColors.textSecondary};font-size:20px;cursor:pointer;padding:0 4px;">×</button>
            </div>
            <div id="settings-body"></div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;border-top:1px solid ${themeColors.divider};padding-top:14px;position:sticky;bottom:0;background:${themeColors.bg};z-index:1;flex-wrap:wrap;">
                <button id="settings-clear-data-btn" style="padding:6px 14px;border-radius:4px;border:1px solid #8a4a4a;background:#5a2a2a;color:#e0a0a0;cursor:pointer;font-size:12px;">🗑 清除当前房间数据</button>
                <button id="settings-reset-jobcolors-btn" style="padding:6px 14px;border-radius:4px;border:1px solid ${themeColors.border};background:transparent;color:${themeColors.textSecondary};cursor:pointer;font-size:12px;">重置职业颜色</button>
                <button id="settings-reset-colors-btn" style="padding:6px 14px;border-radius:4px;border:1px solid ${themeColors.border};background:transparent;color:${themeColors.textSecondary};cursor:pointer;font-size:12px;">重置界面颜色</button>
                <button id="settings-save-btn" style="padding:6px 20px;border-radius:4px;border:none;background:#4a8a5a;color:#fff;cursor:pointer;font-size:13px;font-weight:bold;">保存</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        settingsModal = overlay;
        renderSettingsBody();
        modal.querySelector('#settings-close-btn').addEventListener('click', () => {
            if (isSettingsDirty) {
                if (confirm('您有未保存的修改，确定要关闭吗？')) {
                    closeSettings();
                }
            } else {
                closeSettings();
            }
        });
        modal.querySelector('#settings-save-btn').addEventListener('click', saveSettingsFromModal);
        modal.querySelector('#settings-reset-jobcolors-btn').addEventListener('click', () => {
            if (confirm('重置所有职业颜色到默认值？')) {
                pendingSettings.jobColorPreset = defaultSettings.jobColorPreset;
                pendingSettings.jobColors = {};
                isSettingsDirty = true;
                updateSettingsTitle();
                renderSettingsBody();
                bindSettingsEvents();
                previewSettings();
            }
        });
        modal.querySelector('#settings-reset-colors-btn').addEventListener('click', () => {
            if (confirm('重置所有界面颜色到默认值？')) {
                pendingSettings.colors = JSON.parse(JSON.stringify(defaultSettings.colors));
                isSettingsDirty = true;
                updateSettingsTitle();
                renderSettingsBody();
                bindSettingsEvents();
                previewSettings();
            }
        });
        modal.querySelector('#settings-clear-data-btn').addEventListener('click', () => {
            if (confirm('确定要清除当前房间的所有数据吗？此操作不可撤销！')) {
                store.clearRoomData();
                renderPlayerList(cachedPlayers);
                // 清空数据后刷新预览
                if (settings.showPreview) {
                    try {
                        if (document.getElementById('werewolf-preview-container')) {
                            updatePreviewWindow({ preserveEdits: false });
                        }
                    } catch(e) {}
                }
                closeSettings();
            }
        });
        bindSettingsEvents();
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                if (isSettingsDirty) {
                    if (confirm('您有未保存的修改，确定要关闭吗？')) {
                        closeSettings();
                    }
                } else {
                    closeSettings();
                }
            }
        });
        document.addEventListener('keydown', onSettingsKeydown);
    }

    function closeSettings() {
        if (settingsModal) {
            settingsModal.remove();
            settingsModal = null;
        }
        pendingSettings = null;
        isSettingsDirty = false;
        document.removeEventListener('keydown', onSettingsKeydown);
    }

    function onSettingsKeydown(e) {
        if (e.key === 'Escape') {
            if (isSettingsDirty) {
                if (confirm('您有未保存的修改，确定要关闭吗？')) {
                    closeSettings();
                }
            } else {
                closeSettings();
            }
        }
    }

    function updateSettingsTitle() {
        const modal = document.getElementById('werewolf-settings-modal');
        if (!modal) return;
        const title = modal.querySelector('#settings-title');
        if (title) {
            title.textContent = isSettingsDirty ? '设置 *' : '设置';
        }
    }

    function renderSettingsHTML() {
        const c = pendingSettings || settings;
        const theme = getCurrentTheme(c);
        const colors = c.colors[theme] || c.colors.dark;
        const presetColors = getPresetJobColors(
            c.jobColorPreset === 'custom' ? 'classic' : c.jobColorPreset,
            theme
        );
        const userColors = c.jobColors || {};
        const presetJobs = ['村人', '占卜师', '灵能者', '人狼', '狂人', '妖狐', '猎人', '共有者', '面包店'];
        let jobColorRows = '';
        for (const job of presetJobs) {
            let color;
            if (c.jobColorPreset === 'custom' && userColors[job]) {
                color = userColors[job];
            } else {
                color = presetColors[job] || '#888';
            }
            const isCustom = c.jobColorPreset === 'custom';
            jobColorRows += `
                <div style="display:flex;align-items:center;gap:6px;margin:2px 0;">
                    <span style="width:60px;font-size:11px;color:${colors.textSecondary};">${job}</span>
                    <input type="color" data-job-color="${job}" value="${color}" style="width:32px;height:28px;padding:0;border:1px solid ${colors.border};border-radius:3px;cursor:pointer;background:transparent;" ${isCustom ? '' : 'disabled'}>
                    <button data-job-reset="${job}" style="font-size:10px;padding:0 6px;background:transparent;border:1px solid ${colors.border};border-radius:2px;color:${colors.textSecondary};cursor:pointer;${isCustom ? '' : 'display:none;'}">↺</button>
                </div>
            `;
        }
        const presets = [
            { key: 'classic', label: '经典' },
            { key: 'soft', label: '柔和' },
            { key: 'highcontrast', label: '高对比' },
            { key: 'colorblind', label: '色盲友好' },
            { key: 'custom', label: '自定义' }
        ];
        let presetButtons = '';
        for (const p of presets) {
            const active = c.jobColorPreset === p.key;
            presetButtons += `
                <button data-preset="${p.key}" style="padding:3px 10px;border-radius:3px;border:1px solid ${active ? '#66aadd' : colors.border};background:${active ? 'rgba(100,200,255,0.15)' : 'transparent'};color:${active ? '#66aadd' : colors.textSecondary};cursor:pointer;font-size:11px;">${p.label}</button>
            `;
        }
        const colorItems = [
            { key: 'bg', label: '侧栏背景' },
            { key: 'text', label: '主文字' },
            { key: 'textSecondary', label: '次要文字' },
            { key: 'border', label: '边框' },
            { key: 'divider', label: '分割线' },
            { key: 'highlight', label: '高亮' },
            { key: 'hover', label: '悬停' },
            { key: 'mark', label: '标记符号' },
            { key: 'view', label: '视角指示' }
        ];
        let colorRows = '';
        for (const item of colorItems) {
            const value = colors[item.key] || '';
            const isTransparent = value === 'transparent';
            const displayValue = isTransparent ? '#ffffff' : value;
            colorRows += `
                <div style="display:flex;align-items:center;gap:4px;">
                    <label style="font-size:11px;color:${colors.textSecondary};width:60px;flex-shrink:0;">${item.label}</label>
                    <input type="color" data-color-key="${item.key}" value="${displayValue}" style="width:28px;height:24px;padding:0;border:1px solid ${colors.border};border-radius:3px;cursor:pointer;background:transparent;">
                    ${isTransparent ? '<span style="font-size:9px;color:'+colors.textSecondary+';">透明</span>' : ''}
                </div>
            `;
        }
        const posLeftActive = c.position === 'left';
        const posRightActive = c.position === 'right';
        const themeActive = c.theme;
        const themeButtons = `
            <div style="display:flex;gap:4px;">
                <button data-theme="light" style="flex:1;padding:4px 6px;border-radius:3px;border:1px solid ${themeActive === 'light' ? '#66aadd' : colors.border};background:${themeActive === 'light' ? 'rgba(100,200,255,0.15)' : 'transparent'};color:${themeActive === 'light' ? '#66aadd' : colors.textSecondary};cursor:pointer;font-size:14px;line-height:1.4;">☀️</button>
                <button data-theme="dark" style="flex:1;padding:4px 6px;border-radius:3px;border:1px solid ${themeActive === 'dark' ? '#66aadd' : colors.border};background:${themeActive === 'dark' ? 'rgba(100,200,255,0.15)' : 'transparent'};color:${themeActive === 'dark' ? '#66aadd' : colors.textSecondary};cursor:pointer;font-size:14px;line-height:1.4;">🌙</button>
                <button data-theme="system" style="flex:1;padding:4px 6px;border-radius:3px;border:1px solid ${themeActive === 'system' ? '#66aadd' : colors.border};background:${themeActive === 'system' ? 'rgba(100,200,255,0.15)' : 'transparent'};color:${themeActive === 'system' ? '#66aadd' : colors.textSecondary};cursor:pointer;font-size:12px;line-height:1.4;">系统</button>
            </div>
        `;
        const fontSizeOptions = [8,9,10,11,12,13,14,15,16,17,18,19,20];
        let fontSizeHTML = '';
        for (const size of fontSizeOptions) {
            const selected = c.baseFontSize == size ? 'selected' : '';
            fontSizeHTML += `<option value="${size}" ${selected}>${size}px</option>`;
        }
        const opMode = c.operationMode || 'quick';
        const showPreview = c.showPreview || false;
        const showCommonGray = c.showCommonGray || false;
        const showIndependentGray = c.showIndependentGray || false;
        const previewOpacity = c.previewOpacity || 0.9;
        const previewSize = c.previewSize || 'medium';

        return `
            <div style="margin-bottom:16px;">
                <h3 style="font-size:13px;margin:0 0 8px 0;color:${colors.text};border-bottom:1px solid ${colors.divider};padding-bottom:4px;">通用</h3>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;">
                    <div>
                        <label style="font-size:12px;color:${colors.textSecondary};display:block;margin-bottom:2px;">主题</label>
                        ${themeButtons}
                    </div>
                    <div>
                        <label style="font-size:12px;color:${colors.textSecondary};display:block;margin-bottom:2px;">侧栏位置</label>
                        <div style="display:flex;gap:4px;">
                            <button data-position="left" style="flex:1;padding:4px 6px;border-radius:3px;border:1px solid ${posLeftActive ? '#66aadd' : colors.border};background:${posLeftActive ? 'rgba(100,200,255,0.15)' : 'transparent'};color:${posLeftActive ? '#66aadd' : colors.textSecondary};cursor:pointer;font-size:12px;">左侧</button>
                            <button data-position="right" style="flex:1;padding:4px 6px;border-radius:3px;border:1px solid ${posRightActive ? '#66aadd' : colors.border};background:${posRightActive ? 'rgba(100,200,255,0.15)' : 'transparent'};color:${posRightActive ? '#66aadd' : colors.textSecondary};cursor:pointer;font-size:12px;">右侧</button>
                        </div>
                    </div>
                    <div>
                        <label style="font-size:12px;color:${colors.textSecondary};display:block;margin-bottom:2px;">宽度</label>
                        <select data-setting="width" style="width:100%;padding:4px 6px;border-radius:3px;border:1px solid ${colors.border};background:${colors.bg};color:${colors.text};font-size:12px;">
                            <option value="small" ${c.width === 'small' ? 'selected' : ''}>小 (140px)</option>
                            <option value="medium" ${c.width === 'medium' ? 'selected' : ''}>中 (180px)</option>
                            <option value="large" ${c.width === 'large' ? 'selected' : ''}>大 (220px)</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:12px;color:${colors.textSecondary};display:block;margin-bottom:2px;">基础字号</label>
                        <select data-setting="baseFontSize" style="width:100%;padding:4px 6px;border-radius:3px;border:1px solid ${colors.border};background:${colors.bg};color:${colors.text};font-size:12px;">
                            ${fontSizeHTML}
                        </select>
                    </div>
                </div>
            </div>
            <div style="margin-bottom:16px;">
                <h3 style="font-size:13px;margin:0 0 8px 0;color:${colors.text};border-bottom:1px solid ${colors.divider};padding-bottom:4px;">操作模式</h3>
                <div style="display:flex;gap:4px;">
                    <button data-mode="quick" style="flex:1;padding:6px 8px;border-radius:4px;border:1px solid ${opMode === 'quick' ? '#66aadd' : colors.border};background:${opMode === 'quick' ? 'rgba(100,200,255,0.15)' : 'transparent'};color:${opMode === 'quick' ? '#66aadd' : colors.textSecondary};cursor:pointer;font-size:12px;line-height:1.4;">🔄 右键切换视角</button>
                    <button data-mode="menu" style="flex:1;padding:6px 8px;border-radius:4px;border:1px solid ${opMode === 'menu' ? '#66aadd' : colors.border};background:${opMode === 'menu' ? 'rgba(100,200,255,0.15)' : 'transparent'};color:${opMode === 'menu' ? '#66aadd' : colors.textSecondary};cursor:pointer;font-size:12px;line-height:1.4;">📋 右键菜单操作</button>
                </div>
                <div style="font-size:11px;color:${colors.textSecondary};margin-top:4px;">
                    ${opMode === 'quick' ? '当前模式：左键高亮发言，滚轮记录占卜，右键切换视角，长按右键清空身份' : '当前模式：左键高亮发言，右键弹出操作菜单'}
                </div>
            </div>
            <div style="margin-bottom:16px;">
                <h3 style="font-size:13px;margin:0 0 8px 0;color:${colors.text};border-bottom:1px solid ${colors.divider};padding-bottom:4px;">死亡玩家</h3>
                <div>
                    <label style="font-size:12px;color:${colors.textSecondary};display:block;margin-bottom:2px;">文字透明度：${(c.deathOpacity * 100).toFixed(0)}%</label>
                    <input type="range" data-setting="deathOpacity" min="0.15" max="0.75" step="0.05" value="${c.deathOpacity}" style="width:100%;">
                    <div style="display:flex;justify-content:space-between;font-size:10px;color:${colors.textSecondary};">
                        <span>15%</span>
                        <span>75%</span>
                    </div>
                </div>
            </div>
            <div style="margin-bottom:16px;">
                <h3 style="font-size:13px;margin:0 0 8px 0;color:${colors.text};border-bottom:1px solid ${colors.divider};padding-bottom:4px;">职业颜色</h3>
                <div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;">
                    ${presetButtons}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;max-height:180px;overflow-y:auto;border:1px solid ${colors.divider};border-radius:4px;padding:6px 8px;">
                    ${jobColorRows}
                </div>
            </div>
            <div style="margin-bottom:16px;">
                <h3 style="font-size:13px;margin:0 0 8px 0;color:${colors.text};border-bottom:1px solid ${colors.divider};padding-bottom:4px;">导出预览</h3>
                <div>
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:${colors.textSecondary};cursor:pointer;">
                        <input type="checkbox" data-setting="showPreview" ${showPreview ? 'checked' : ''}>
                        启用预览窗口
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:${colors.textSecondary};cursor:pointer;margin-top:4px;">
                        <input type="checkbox" data-setting="showCommonGray" ${showCommonGray ? 'checked' : ''}>
                        显示共灰区
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:${colors.textSecondary};cursor:pointer;margin-top:4px;">
                        <input type="checkbox" data-setting="showIndependentGray" ${showIndependentGray ? 'checked' : ''}>
                        显示独立灰区
                    </label>
                    <div style="margin-top:8px;">
                        <label style="font-size:12px;color:${colors.textSecondary};display:block;margin-bottom:2px;">
                            预览窗口大小
                        </label>
                        <select data-setting="previewSize" style="width:100%;padding:4px 6px;border-radius:3px;border:1px solid ${colors.border};background:${colors.bg};color:${colors.text};font-size:12px;">
                            <option value="small" ${previewSize === 'small' ? 'selected' : ''}>小 (500×200)</option>
                            <option value="medium" ${previewSize === 'medium' ? 'selected' : ''}>中 (700×300)</option>
                            <option value="large" ${previewSize === 'large' ? 'selected' : ''}>大 (900×400)</option>
                        </select>
                    </div>
                    <div style="margin-top:8px;">
                        <label style="font-size:12px;color:${colors.textSecondary};display:block;margin-bottom:2px;">
                            不透明度：${Math.round(previewOpacity * 100)}%
                        </label>
                        <input type="range" data-setting="previewOpacity" min="0.3" max="1" step="0.05" value="${previewOpacity}" style="width:100%;">
                    </div>
                </div>
            </div>
            <div>
                <h3 style="font-size:13px;margin:0 0 8px 0;color:${colors.text};border-bottom:1px solid ${colors.divider};padding-bottom:4px;">界面颜色</h3>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;">
                    ${colorRows}
                </div>
            </div>
        `;
    }

    function renderSettingsBody() {
        const modal = document.getElementById('werewolf-settings-modal');
        if (!modal) return;
        const body = modal.querySelector('#settings-body');
        if (body) {
            body.innerHTML = renderSettingsHTML();
        }
        const c = pendingSettings || settings;
        const theme = getCurrentTheme(c);
        const colors = c.colors[theme] || c.colors.dark;
        modal.style.background = colors.bg;
        modal.style.color = colors.text;
        modal.style.borderColor = colors.border;
        const titleDiv = modal.querySelector('div:first-child');
        if (titleDiv) {
            titleDiv.style.borderBottomColor = colors.divider;
        }
        const closeBtn = modal.querySelector('#settings-close-btn');
        if (closeBtn) {
            closeBtn.style.color = colors.textSecondary;
        }
        const resetBtns = modal.querySelectorAll('#settings-reset-jobcolors-btn, #settings-reset-colors-btn, #settings-clear-data-btn');
        resetBtns.forEach(btn => {
            btn.style.color = btn.id === 'settings-clear-data-btn' ? '#e0a0a0' : colors.textSecondary;
            btn.style.borderColor = btn.id === 'settings-clear-data-btn' ? '#8a4a4a' : colors.border;
        });
    }

    function bindSettingsEvents() {
        const modal = document.getElementById('werewolf-settings-modal');
        if (!modal) return;
        modal.querySelectorAll('[data-theme]').forEach(el => {
            el.addEventListener('click', () => {
                pendingSettings.theme = el.dataset.theme;
                isSettingsDirty = true;
                updateSettingsTitle();
                renderSettingsBody();
                bindSettingsEvents();
                previewSettings();
            });
        });
        modal.querySelectorAll('[data-mode]').forEach(el => {
            el.addEventListener('click', () => {
                pendingSettings.operationMode = el.dataset.mode;
                isSettingsDirty = true;
                updateSettingsTitle();
                renderSettingsBody();
                bindSettingsEvents();
                if (el.dataset.mode === 'menu') {
                    currentPerspective = null;
                    pendingSettings.perspective = null;
                }
                previewSettings();
            });
        });
        modal.querySelectorAll('[data-setting]').forEach(el => {
            const eventType = el.type === 'checkbox' ? 'change' : 'input';
            el.addEventListener(eventType, () => {
                const key = el.dataset.setting;
                let value;
                if (el.type === 'checkbox') {
                    value = el.checked;
                } else if (el.type === 'range') {
                    value = parseFloat(el.value);
                } else if (el.type === 'number') {
                    value = parseInt(el.value) || 0;
                } else {
                    value = el.value;
                }
                if (key === 'baseFontSize') {
                    value = Number(value) || 11;
                }
                pendingSettings[key] = value;
                isSettingsDirty = true;
                updateSettingsTitle();
                previewSettings();
                if (el.type === 'range') {
                    const label = el.closest('div')?.querySelector('label');
                    if (label && key === 'deathOpacity') {
                        label.textContent = `文字透明度：${(value * 100).toFixed(0)}%`;
                    }
                    if (label && key === 'previewOpacity') {
                        label.textContent = `不透明度：${Math.round(value * 100)}%`;
                    }
                }
                if (['showPreview', 'showCommonGray', 'showIndependentGray', 'previewSize', 'previewOpacity'].includes(key)) {
                    if (key === 'showPreview') {
                        if (value) {
                            try { createPreviewWindow(); } catch(e) {}
                        } else {
                            try { closePreviewWindow(); } catch(e) {}
                        }
                    } else {
                        try { updatePreviewWindow(); } catch(e) {}
                    }
                }
            });
        });
        modal.querySelectorAll('[data-position]').forEach(el => {
            el.addEventListener('click', () => {
                pendingSettings.position = el.dataset.position;
                isSettingsDirty = true;
                updateSettingsTitle();
                renderSettingsBody();
                bindSettingsEvents();
                previewSettings();
            });
        });
        modal.querySelectorAll('[data-preset]').forEach(el => {
            el.addEventListener('click', () => {
                pendingSettings.jobColorPreset = el.dataset.preset;
                isSettingsDirty = true;
                updateSettingsTitle();
                renderSettingsBody();
                bindSettingsEvents();
                previewSettings();
            });
        });
        modal.querySelectorAll('[data-color-key]').forEach(el => {
            el.addEventListener('input', () => {
                const key = el.dataset.colorKey;
                const theme = getCurrentTheme(pendingSettings);
                pendingSettings.colors[theme][key] = el.value;
                isSettingsDirty = true;
                updateSettingsTitle();
                previewSettings();
            });
        });
        modal.querySelectorAll('[data-job-color]').forEach(el => {
            el.addEventListener('input', () => {
                if (pendingSettings.jobColorPreset !== 'custom') {
                    pendingSettings.jobColorPreset = 'custom';
                    renderSettingsBody();
                    bindSettingsEvents();
                }
                const job = el.dataset.jobColor;
                if (!pendingSettings.jobColors) pendingSettings.jobColors = {};
                pendingSettings.jobColors[job] = el.value;
                isSettingsDirty = true;
                updateSettingsTitle();
                previewSettings();
            });
        });
        modal.querySelectorAll('[data-job-reset]').forEach(el => {
            el.addEventListener('click', () => {
                const job = el.dataset.jobReset;
                if (pendingSettings.jobColors) {
                    delete pendingSettings.jobColors[job];
                }
                isSettingsDirty = true;
                updateSettingsTitle();
                renderSettingsBody();
                bindSettingsEvents();
                previewSettings();
            });
        });
    }

    function saveSettingsFromModal() {
        if (!pendingSettings) return;
        settings = JSON.parse(JSON.stringify(pendingSettings));
        settings.perspective = currentPerspective;
        settings.collapsed = isCollapsed;
        saveSettings(settings);
        isSettingsDirty = false;
        updateSettingsTitle();
        applySettingsToSidebar();
        showToast('设置已保存', 1500);
        closeSettings();
    }

    function previewSettings() {
        if (!pendingSettings) return;
        if (pendingSettings.deathOpacity === undefined) {
            pendingSettings.deathOpacity = settings.deathOpacity || 0.5;
        }
        applySettingsToSidebar(pendingSettings);
        const container = document.getElementById('werewolf-preview-container');
        if (container && container.style.display !== 'none') {
            updatePreviewWindow();
        }
    }

    // ============================================================
    // 12. 灰区计算
    // ============================================================

    function calculateGrayZones() {
        const allPlayers = cachedPlayers;
        if (allPlayers.length === 0) return { commonGray: [], independentGray: {} };

        const storeData = store.get();
        const identities = storeData.identity || {};
        const actionData = storeData.action || {};
        const deadPlayerIds = new Set();

        for (const p of allPlayers) {
            if (p.isDead) deadPlayerIds.add(p.id);
        }

        const globalIdentities = identities['global'] || {};
        const claimedPlayerIds = new Set();

        for (const pid in globalIdentities) {
            const job = globalIdentities[pid];
            if (job && job !== '村人') {
                claimedPlayerIds.add(pid);
            }
        }

        const divineRecords = {};
        for (const operatorId in actionData) {
            const data = actionData[operatorId];
            if (!data || !data.targets || data.targets.length === 0) continue;

            const operatorJob = globalIdentities[operatorId];
            if (operatorJob !== '占卜师') continue;

            divineRecords[operatorId] = data.targets.map(t => t.target);
        }

        const commonGray = [];
        for (const p of allPlayers) {
            if (claimedPlayerIds.has(p.id)) continue;
            if (deadPlayerIds.has(p.id)) continue;
            let isDivined = false;
            for (const operatorId in divineRecords) {
                if (divineRecords[operatorId].includes(p.name)) {
                    isDivined = true;
                    break;
                }
            }
            if (!isDivined) commonGray.push(p.name);
        }

        const independentGray = {};
        for (const operatorId in divineRecords) {
            const targets = divineRecords[operatorId];
            const gray = [];
            for (const p of allPlayers) {
                if (claimedPlayerIds.has(p.id)) continue;
                if (deadPlayerIds.has(p.id)) continue;
                if (!targets.includes(p.name)) {
                    gray.push(p.name);
                }
            }
            independentGray[operatorId] = gray;
        }

        return { commonGray, independentGray };
    }

    // ============================================================
    // 13. 导出功能
    // ============================================================

    function buildExportBlocks(settingsOverride) {
        const s = settingsOverride || settings;
        const blocks = [];

        if (!cachedPlayers || cachedPlayers.length === 0) {
            blocks.push({
                id: 'block_empty',
                type: 'job',
                content: '暂无玩家数据，请点击「读取」刷新',
                editable: false
            });
            return blocks;
        }

        let jobOrder = cachedJobList || [];
        if (jobOrder.length === 0) {
            jobOrder = ['占卜师', '灵能者', '人狼', '狂人', '妖狐', '猎人', '共有者', '村人'];
        }
        jobOrder = jobOrder.filter(j => j !== '村人');

        const storeData = store.get();
        const identities = storeData.identity || {};
        const actionData = storeData.action || {};
        const grayZones = calculateGrayZones();

        let counter = 0;
        const groups = {};

        const globalIdentities = identities['global'] || {};

        for (const pid in globalIdentities) {
            const job = globalIdentities[pid];
            if (!job || job === '村人') continue;
            if (!groups[job]) groups[job] = [];

            const player = cachedPlayers.find(p => p.id === pid);
            if (!player) continue;

            const action = actionData[pid] || {};
            const chain = [];
            if (action.targets) {
                for (const entry of action.targets) {
                    chain.push(entry.target + entry.symbol);
                }
            }
            if (action.death) {
                chain.push(action.death);
            }
            groups[job].push({ name: player.name, chain: chain.join('→'), id: pid });
        }

        const divineJob = '占卜师';
        if (groups[divineJob] && groups[divineJob].length > 0) {
            blocks.push({
                id: 'block_job_' + counter++,
                type: 'job',
                content: divineJob + '（' + groups[divineJob].length + '）',
                editable: false
            });
            blocks.push({
                id: 'block_sep_' + counter++,
                type: 'separator',
                content: '\n',
                editable: true
            });

            for (const item of groups[divineJob]) {
                blocks.push({
                    id: 'block_player_' + counter++,
                    type: 'player',
                    content: item.name,
                    editable: false
                });
                blocks.push({
                    id: 'block_symbol_' + counter++,
                    type: 'symbol',
                    content: '：',
                    editable: false
                });
                if (item.chain) {
                    blocks.push({
                        id: 'block_symbol_' + counter++,
                        type: 'symbol',
                        content: item.chain,
                        editable: false
                    });
                }
                blocks.push({
                    id: 'block_sep_' + counter++,
                    type: 'separator',
                    content: '\n',
                    editable: true
                });

                if (s.showIndependentGray) {
                    const opId = item.id;
                    if (opId && grayZones.independentGray[opId]?.length > 0) {
                        const grayList = grayZones.independentGray[opId];
                        blocks.push({
                            id: 'block_gray_' + counter++,
                            type: 'gray',
                            content: '灰区：' + grayList.join('，'),
                            editable: false
                        });
                        blocks.push({
                            id: 'block_sep_' + counter++,
                            type: 'separator',
                            content: '\n',
                            editable: true
                        });
                    }
                }
            }

            blocks.push({
                id: 'block_sep_' + counter++,
                type: 'separator',
                content: '\n',
                editable: true
            });
        }

        if (s.showCommonGray && grayZones.commonGray.length > 0) {
            blocks.push({
                id: 'block_job_' + counter++,
                type: 'job',
                content: '共灰：',
                editable: false
            });
            blocks.push({
                id: 'block_sep_' + counter++,
                type: 'separator',
                content: '\n',
                editable: true
            });
            blocks.push({
                id: 'block_gray_' + counter++,
                type: 'gray',
                content: grayZones.commonGray.join('，'),
                editable: false
            });
            blocks.push({
                id: 'block_sep_' + counter++,
                type: 'separator',
                content: '\n',
                editable: true
            });
            blocks.push({
                id: 'block_sep_' + counter++,
                type: 'separator',
                content: '\n',
                editable: true
            });
        }

        for (const job of jobOrder) {
            if (job === divineJob) continue;
            if (!groups[job] || groups[job].length === 0) continue;

            blocks.push({
                id: 'block_job_' + counter++,
                type: 'job',
                content: job + '（' + groups[job].length + '）',
                editable: false
            });
            blocks.push({
                id: 'block_sep_' + counter++,
                type: 'separator',
                content: '\n',
                editable: true
            });

            for (const item of groups[job]) {
                blocks.push({
                    id: 'block_player_' + counter++,
                    type: 'player',
                    content: item.name,
                    editable: false
                });
                blocks.push({
                    id: 'block_symbol_' + counter++,
                    type: 'symbol',
                    content: '：',
                    editable: false
                });
                if (item.chain) {
                    blocks.push({
                        id: 'block_symbol_' + counter++,
                        type: 'symbol',
                        content: item.chain,
                        editable: false
                    });
                }
                blocks.push({
                    id: 'block_sep_' + counter++,
                    type: 'separator',
                    content: '\n',
                    editable: true
                });
            }

            blocks.push({
                id: 'block_sep_' + counter++,
                type: 'separator',
                content: '\n',
                editable: true
            });
        }

        return blocks;
    }

    function blocksToText(blocks) {
        let text = '';
        for (const block of blocks) {
            if (block.type === 'separator') {
                text += block.content;
            } else {
                text += block.content;
            }
        }
        return text;
    }

    // ============================================================
    // 14. 触发玩家高亮（修复版 - 完全不依赖类名）
    // ============================================================

    function triggerPlayerHighlight(playerId) {
        if (!playerId) return false;

        // 1. 通过玩家链接定位（唯一稳定的标识）
        const link = document.querySelector(`a[href="/user/${CSS.escape(playerId)}"]`);
        if (!link) {
            showToast(`未找到玩家「${playerId}」`, 1500);
            return false;
        }

        // 2. 从链接向上遍历，找包含 fa-search 图标的容器
        let container = link.parentElement;
        let maxDepth = 10;
        let foundIcon = null;

        while (container && container !== document.body && maxDepth > 0) {
            // 在当前容器内查找搜索图标
            const icon = container.querySelector('svg[class*="fa-search"]');
            if (icon) {
                foundIcon = icon;
                break;
            }
            container = container.parentElement;
            maxDepth--;
        }

        if (!foundIcon) {
            showToast(`未找到「${playerId}」的发言高亮按钮`, 1500);
            return false;
        }

        // 3. 找可点击的父元素（向上查找可交互元素）
        let clickTarget = foundIcon;
        let el = foundIcon.parentElement;
        let depth = 5;

        while (el && el !== document.body && depth > 0) {
            // 检查是否是可点击元素
            if (el.hasAttribute('onclick') ||
                el.getAttribute('role') === 'button' ||
                el.tagName === 'BUTTON' ||
                el.style.cursor === 'pointer' ||
                el.getAttribute('data-clickable') !== null ||
                el.closest('button') !== null) {
                clickTarget = el;
                break;
            }
            // 检查父元素是否是 button 或可点击的 span
            const parentButton = el.closest('button, span[role="button"]');
            if (parentButton) {
                clickTarget = parentButton;
                break;
            }
            el = el.parentElement;
            depth--;
        }

        // 如果还是找不到合适的点击目标，尝试点击图标本身或其父级 span
        if (clickTarget === foundIcon) {
            // 尝试找父级 span（通常包裹图标的 span 是可点击的）
            const parentSpan = foundIcon.closest('span');
            if (parentSpan && parentSpan !== foundIcon.parentElement) {
                clickTarget = parentSpan;
            }
        }

        try {
            // 触发点击
            clickTarget.click();

            // 验证是否成功（可选：检查是否有高亮效果）
            const player = cachedPlayers.find(p => p.id === playerId);
            showToast(`🔍 已高亮「${player ? player.name : playerId}」的发言`, 1000);
            return true;
        } catch (e) {
            console.warn('触发高亮失败:', e);

            // 尝试备用方法：直接触发图标父级的点击
            try {
                if (foundIcon.parentElement) {
                    foundIcon.parentElement.click();
                    showToast(`🔍 已高亮「${playerId}」`, 1000);
                    return true;
                }
            } catch (e2) {
                // 忽略
            }

            showToast(`高亮失败，请手动点击发言旁的🔍图标`, 1500);
            return false;
        }
    }

    // ============================================================
    // 15. 预览窗口
    // ============================================================

    function createPreviewWindow() {
        if (document.getElementById('werewolf-preview-container')) {
            togglePreviewWindow();
            return;
        }

        const s = settings;
        const opacity = s.previewOpacity || 0.9;
        const size = s.previewSize || 'medium';
        const sizeMap = {
            small: { width: '300px', height: '200px' },
            medium: { width: '450px', height: '300px' },
            large: { width: '600px', height: '400px' }
        };
        const dims = sizeMap[size] || sizeMap.medium;
        const pos = s.previewPosition || { x: null, y: null };

        const container = document.createElement('div');
        container.id = 'werewolf-preview-container';
        const left = pos.x !== null ? `${pos.x}px` : '50%';
        const top = pos.y !== null ? `${pos.y}px` : 'auto';
        const transform = pos.x === null ? 'translateX(-50%)' : 'none';
        const bottom = pos.y === null ? '0' : 'auto';

        container.style.cssText = `
            position: fixed;
            bottom: ${bottom};
            left: ${left};
            top: ${top};
            transform: ${transform};
            width: ${dims.width};
            height: ${dims.height};
            background: rgba(30, 30, 40, ${opacity});
            border: 2px solid #4a4a6a;
            border-radius: 8px 8px 0 0;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            box-shadow: 0 -4px 20px rgba(0,0,0,0.5);
            font-family: 'Microsoft YaHei', sans-serif;
            resize: both;
            overflow: hidden;
            min-width: 300px;
            min-height: 150px;
            max-width: 95vw;
            max-height: 80vh;
        `;

        const titleBar = document.createElement('div');
        titleBar.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 10px;
            background: rgba(50, 50, 70, 0.8);
            border-bottom: 1px solid #4a4a6a;
            flex-shrink: 0;
            cursor: move;
            user-select: none;
        `;
        titleBar.innerHTML = `
            <span style="font-size:12px;color:#a0a0b0;font-weight:bold;">📋 导出预览</span>
            <div style="display:flex;gap:6px;align-items:center;">
                <button id="preview-copy-btn" style="padding:1px 8px;border-radius:3px;border:1px solid #4a6a8a;background:#2a3a5a;color:#a0a0b0;cursor:pointer;font-size:10px;">复制</button>
                <button id="preview-refresh-btn" style="padding:1px 8px;border-radius:3px;border:1px solid #4a8a5a;background:#2a5a3a;color:#a0a0b0;cursor:pointer;font-size:10px;">刷新</button>
                <button id="preview-reset-btn" style="padding:1px 8px;border-radius:3px;border:1px solid #8a4a4a;background:#5a2a2a;color:#a0a0b0;cursor:pointer;font-size:10px;">重置</button>
                <button id="preview-close-btn" style="padding:1px 8px;border-radius:3px;border:1px solid #8a4a4a;background:#5a2a2a;color:#a0a0b0;cursor:pointer;font-size:10px;">×</button>
            </div>
        `;
        container.appendChild(titleBar);

        const editor = document.createElement('div');
        editor.id = 'preview-editor';
        editor.contentEditable = true;
        editor.style.cssText = `
            flex: 1;
            overflow: auto;
            padding: 8px 12px;
            font-family: 'Consolas', 'Microsoft YaHei', monospace;
            font-size: 12px;
            line-height: 1.8;
            color: #e0e0e0;
            outline: none;
            white-space: pre-wrap;
            word-wrap: break-word;
            background: transparent;
            user-select: text;
        `;
        container.appendChild(editor);

        document.body.appendChild(container);
        previewWindow = container;

        document.getElementById('preview-close-btn').addEventListener('click', () => {
            container.style.display = 'none';
            const s = getSettings();
            s.showPreview = false;
            saveSettings(s);
            settings = getSettings();
        });

        document.getElementById('preview-copy-btn').addEventListener('click', () => {
            const text = editor.innerText;
            navigator.clipboard.writeText(text).then(
                () => showToast('已复制', 1200),
                () => {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.cssText = 'position:fixed;left:-9999px;';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    ta.remove();
                    showToast('已复制', 1200);
                }
            );
        });

        document.getElementById('preview-refresh-btn').addEventListener('click', () => {
            updatePreviewWindow({ preserveEdits: true });
            showToast('已刷新数据', 800);
        });

        document.getElementById('preview-reset-btn').addEventListener('click', () => {
            updatePreviewWindow({ preserveEdits: false });
            showToast('已重置预览', 800);
        });

        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            const x = Math.max(0, e.clientX - dragOffset.x);
            const y = Math.max(0, e.clientY - dragOffset.y);
            container.style.left = x + 'px';
            container.style.top = y + 'px';
            container.style.transform = 'none';
            container.style.bottom = 'auto';
        };

        const onMouseUp = () => {
            if (isDragging) {
                isDragging = false;
                container.style.cursor = 'default';
                const rect = container.getBoundingClientRect();
                const s = getSettings();
                s.previewPosition = { x: rect.left, y: rect.top };
                saveSettings(s);
                settings = getSettings();
            }
        };

        titleBar.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            isDragging = true;
            const rect = container.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            container.style.cursor = 'grabbing';
            container.style.left = rect.left + 'px';
            container.style.top = rect.top + 'px';
            container.style.transform = 'none';
            container.style.bottom = 'auto';
            e.preventDefault();
        });

        container.addEventListener('mousemove', onMouseMove);
        container.addEventListener('mouseup', onMouseUp);
        document.addEventListener('mouseup', onMouseUp);

        setTimeout(() => {
            updatePreviewWindow({ preserveEdits: false });
        }, 50);
    }

    function togglePreviewWindow() {
        const container = document.getElementById('werewolf-preview-container');
        if (container) {
            if (container.style.display === 'none') {
                container.style.display = 'flex';
                setTimeout(() => updatePreviewWindow({ preserveEdits: true }), 50);
            } else {
                container.style.display = 'none';
            }
            return;
        }
        createPreviewWindow();
    }

    function closePreviewWindow() {
        const container = document.getElementById('werewolf-preview-container');
        if (container) {
            container.remove();
        }
        previewWindow = null;
    }

    function updatePreviewWindow(options = { preserveEdits: true }) {
        const editor = document.getElementById('preview-editor');
        if (!editor) return;

        const s = getSettings();
        const newBlocks = buildExportBlocks(s);

        if (options.preserveEdits) {
            const editableContents = {};
            const spans = editor.querySelectorAll('span[contenteditable="true"]');
            for (const span of spans) {
                editableContents[span.dataset.blockId] = span.textContent;
            }

            editor.innerHTML = '';

            for (const block of newBlocks) {
                if (block.type === 'separator') {
                    if (block.content === '\n') {
                        editor.appendChild(document.createElement('br'));
                    } else {
                        editor.appendChild(document.createTextNode(block.content));
                    }
                    continue;
                }

                const span = document.createElement('span');
                if (editableContents[block.id] !== undefined && block.editable) {
                    span.textContent = editableContents[block.id];
                } else {
                    span.textContent = block.content;
                }
                span.contentEditable = block.editable ? 'true' : 'false';
                span.dataset.blockId = block.id;
                span.dataset.blockType = block.type;
                span.dataset.originalContent = block.content;

                if (!block.editable) {
                    span.style.cssText = `
                        background: rgba(60, 60, 80, 0.25);
                        border-radius: 2px;
                        padding: 0 2px;
                        cursor: default;
                    `;
                }

                editor.appendChild(span);
            }
        } else {
            editor.innerHTML = '';
            for (const block of newBlocks) {
                if (block.type === 'separator') {
                    if (block.content === '\n') {
                        editor.appendChild(document.createElement('br'));
                    } else {
                        editor.appendChild(document.createTextNode(block.content));
                    }
                    continue;
                }

                const span = document.createElement('span');
                span.textContent = block.content;
                span.contentEditable = block.editable ? 'true' : 'false';
                span.dataset.blockId = block.id;
                span.dataset.blockType = block.type;
                span.dataset.originalContent = block.content;

                if (!block.editable) {
                    span.style.cssText = `
                        background: rgba(60, 60, 80, 0.25);
                        border-radius: 2px;
                        padding: 0 2px;
                        cursor: default;
                    `;
                }

                editor.appendChild(span);
            }
        }

        previewBlocks = newBlocks;
    }

    function getExportText() {
        const s = getSettings();
        const blocks = buildExportBlocks(s);
        return blocksToText(blocks);
    }

    // ============================================================
    // 16. UI 创建
    // ============================================================

    function createSidebar() {
        if (document.getElementById('werewolf-sidebar')) return;

        const sidebar = document.createElement('div');
        sidebar.id = 'werewolf-sidebar';
        sidebar.style.cssText = `
            position:fixed;left:0;top:60px;
            max-height:calc(100vh - 120px);
            background:rgba(30,30,40,0.95);
            border-right:2px solid #4a4a6a;
            border-radius:0 6px 6px 0;
            padding:8px 6px;
            z-index:9999;
            color:#e0e0e0;
            font-size:11px;
            font-family:'Microsoft YaHei',sans-serif;
            overflow:hidden;
            box-shadow:4px 0 20px rgba(0,0,0,0.5);
            display:flex;
            flex-direction:column;
            transition:width 0.25s ease,padding 0.25s ease,opacity 0.25s ease;
            user-select:none;
        `;

        const titleBar = document.createElement('div');
        titleBar.id = 'werewolf-titlebar';
        titleBar.style.cssText = `
            display:flex;justify-content:space-between;align-items:center;
            margin-bottom:4px;padding-bottom:3px;
            border-bottom:1px solid #4a4a6a;
            font-weight:bold;font-size:12px;color:#a8b8d8;
            flex-shrink:0;min-height:20px;overflow:hidden;white-space:nowrap;
        `;
        titleBar.innerHTML = `
            <span id="werewolf-title-text">狼助理 ${ROOM_ID}</span>
            <span id="perspective-indicator" style="font-size:10px;color:#ffaa66;">全局</span>
        `;

        const playerList = document.createElement('div');
        playerList.id = 'werewolf-player-list';
        playerList.style.cssText = `
            flex:1;overflow-y:auto;min-height:30px;max-height:calc(100vh - 160px);
        `;
        playerList.innerHTML = '<div style="color:#666;text-align:center;padding:10px;font-size:10px;">点击「读取」刷新</div>';

        const toolbar = document.createElement('div');
        toolbar.id = 'werewolf-toolbar';
        toolbar.style.cssText = `
            border-top:1px solid #4a4a6a;padding-top:4px;
            display:flex;gap:3px;flex-shrink:0;min-height:22px;align-items:center;overflow:hidden;
        `;

        const btnStyle = `
            padding:1px 5px;border-radius:3px;cursor:pointer;font-size:10px;
            border:1px solid #4a4a6a;background:#2a2a3a;color:#a0a0b0;
            flex:1;text-align:center;min-width:0;
            display:flex;align-items:center;justify-content:center;
            white-space:nowrap;
            height:22px;line-height:22px;
        `;

        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = '读取';
        refreshBtn.style.cssText = btnStyle + 'background:#2a5a3a;border-color:#4a8a5a;';
        refreshBtn.addEventListener('click', () => {
            refreshAll();
            refreshBtn.textContent = 'OK';
            setTimeout(() => { refreshBtn.textContent = '读取'; }, 800);
        });

        const exportBtn = document.createElement('button');
        exportBtn.textContent = '导出▼';
        exportBtn.style.cssText = btnStyle + 'background:#2a3a5a;border-color:#4a6a8a;';

        exportBtn.addEventListener('click', (e) => {
            if (e.button === 0) {
                const text = getExportText();
                if (text && text.trim()) {
                    navigator.clipboard.writeText(text).then(
                        () => showToast('已复制', 1200),
                        () => {
                            const ta = document.createElement('textarea');
                            ta.value = text;
                            ta.style.cssText = 'position:fixed;left:-9999px;';
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand('copy');
                            ta.remove();
                            showToast('已复制', 1200);
                        }
                    );
                } else {
                    showToast('暂无数据', 1500);
                }
            }
        });

        exportBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showExportContextMenu(e.clientX, e.clientY);
        });

        const resetBtn = document.createElement('button');
        resetBtn.textContent = '重置';
        resetBtn.style.cssText = btnStyle + 'background:#3a2a3a;border-color:#6a4a4a;';
        resetBtn.addEventListener('click', () => {
            // 第一阶段：清空数据
            store.clearAll();
            currentPerspective = null;
            cachedJobList = [];
            cachedPlayers = [];
            updateIndicator();
            renderPlayerList([]);
            showToast('已重置', 1500);

            // 第二阶段：恢复预览（如果启用）
            if (settings.showPreview) {
                try {
                    // 如果预览窗口不存在或已被移除，重新创建
                    if (!document.getElementById('werewolf-preview-container')) {
                        createPreviewWindow();
                    } else {
                        // 如果存在但被隐藏，显示它
                        const container = document.getElementById('werewolf-preview-container');
                        if (container.style.display === 'none') {
                            container.style.display = 'flex';
                        }
                        // 刷新内容为空数据
                        updatePreviewWindow({ preserveEdits: false });
                    }
                } catch(e) {
                    console.warn('重置预览失败:', e);
                }
            } else {
                // 如果预览未启用，确保它关闭
                closePreviewWindow();
            }
        });

        const settingsBtn = document.createElement('button');
        settingsBtn.textContent = '⚙';
        settingsBtn.style.cssText = btnStyle + 'background:#2a3a4a;border-color:#4a6a8a;font-size:14px;';
        settingsBtn.addEventListener('click', openSettings);

        const collapseBtn = document.createElement('button');
        collapseBtn.id = 'werewolf-collapse-btn';
        collapseBtn.textContent = '<';
        collapseBtn.style.cssText = btnStyle;
        collapseBtn.addEventListener('click', toggleSidebar);

        toolbar.append(refreshBtn, exportBtn, resetBtn, settingsBtn, collapseBtn);
        sidebar.append(titleBar, playerList, toolbar);
        document.body.appendChild(sidebar);

        expandBtn = document.createElement('button');
        expandBtn.id = 'werewolf-expand-btn';
        expandBtn.textContent = '>';
        expandBtn.style.cssText = `
            position:fixed;left:0;top:50%;transform:translateY(-50%);
            padding:8px 4px;background:rgba(30,30,40,0.95);
            border:1px solid #4a4a6a;border-left:none;
            border-radius:0 4px 4px 0;
            color:#a0a0b0;cursor:pointer;font-size:13px;
            z-index:9998;display:none;
            box-shadow:2px 0 10px rgba(0,0,0,0.3);
        `;
        expandBtn.addEventListener('click', toggleSidebar);
        document.body.appendChild(expandBtn);

        sidebar.addEventListener('contextmenu', e => e.preventDefault(), true);
        sidebar.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); }, true);
        sidebar.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); }, true);

        applySettingsToSidebar();

        if (isCollapsed) {
            const s = document.getElementById('werewolf-sidebar');
            if (s) {
                s.style.width = '0px';
                s.style.padding = '0px';
                s.style.border = 'none';
                s.style.overflow = 'hidden';
                s.style.opacity = '0';
                s.style.pointerEvents = 'none';
                const list = document.getElementById('werewolf-player-list');
                if (list) list.style.display = 'none';
                const tb = document.getElementById('werewolf-toolbar');
                if (tb) tb.style.display = 'none';
                const tt = document.getElementById('werewolf-title-text');
                if (tt) tt.textContent = '';
                const ind = document.getElementById('perspective-indicator');
                if (ind) ind.style.display = 'none';
                if (collapseBtn) collapseBtn.style.display = 'none';
                if (expandBtn) { expandBtn.style.display = 'block'; expandBtn.style.left = '0px'; }
            }
        }

        setTimeout(() => {
            refreshAll();
            // 初始化预览窗口（如果设置中已启用）
            if (settings.showPreview) {
                try { createPreviewWindow(); } catch(e) {}
            }
        }, 500);
    }

    // ============================================================
    // 17. 导出右键菜单
    // ============================================================

    function showExportContextMenu(x, y) {
        const existing = document.getElementById('export-context-menu');
        if (existing) existing.remove();

        const s = getSettings();
        const menu = document.createElement('div');
        menu.id = 'export-context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            background: #2a2a3a;
            border: 1px solid #4a4a6a;
            border-radius: 4px;
            padding: 4px 0;
            z-index: 10001;
            min-width: 160px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            font-family: 'Microsoft YaHei', sans-serif;
            font-size: 12px;
        `;

        const items = [
            { label: `${s.showPreview ? '☑' : '☐'} 显示预览`, key: 'showPreview' },
            { label: `${s.showCommonGray ? '☑' : '☐'} 显示共灰区`, key: 'showCommonGray' },
            { label: `${s.showIndependentGray ? '☑' : '☐'} 显示独立灰区`, key: 'showIndependentGray' }
        ];

        for (const item of items) {
            const div = document.createElement('div');
            div.textContent = item.label;
            div.style.cssText = `
                padding: 5px 14px;
                cursor: pointer;
                color: #e0e0e0;
                font-size: 12px;
                transition: background 0.1s;
            `;
            div.addEventListener('mouseenter', () => {
                div.style.background = 'rgba(100,200,255,0.1)';
            });
            div.addEventListener('mouseleave', () => {
                div.style.background = 'transparent';
            });
            div.addEventListener('click', () => {
                const current = getSettings();
                current[item.key] = !current[item.key];
                saveSettings(current);
                settings = getSettings();

                if (item.key === 'showPreview') {
                    if (settings.showPreview) {
                        try { createPreviewWindow(); } catch(e) {}
                    } else {
                        try { closePreviewWindow(); } catch(e) {}
                    }
                } else {
                    try { updatePreviewWindow({ preserveEdits: true }); } catch(e) {}
                }
                menu.remove();
                showToast(`${item.label.replace(/[☑☐]\s/, '')} ${settings[item.key] ? '已开启' : '已关闭'}`, 800);
            });
            menu.appendChild(div);
        }

        document.body.appendChild(menu);

        setTimeout(() => {
            document.addEventListener('click', () => {
                if (document.getElementById('export-context-menu')) {
                    menu.remove();
                }
            }, { once: true });
        }, 10);
    }

    // ============================================================
    // 18. 收起/展开
    // ============================================================

    function toggleSidebar() {
        const s = document.getElementById('werewolf-sidebar');
        const list = document.getElementById('werewolf-player-list');
        const tb = document.getElementById('werewolf-toolbar');
        const cb = document.getElementById('werewolf-collapse-btn');
        const tt = document.getElementById('werewolf-title-text');
        const ind = document.getElementById('perspective-indicator');
        if (!s) return;
        isCollapsed = !isCollapsed;
        settings.collapsed = isCollapsed;
        saveSettings(settings);

        const widthMap = { small: '140px', medium: '180px', large: '220px' };
        const themeColors = getThemeColors(settings);

        if (isCollapsed) {
            s.style.width = '0px';
            s.style.padding = '0px';
            s.style.border = 'none';
            s.style.overflow = 'hidden';
            s.style.opacity = '0';
            s.style.pointerEvents = 'none';
            if (list) list.style.display = 'none';
            if (tb) tb.style.display = 'none';
            if (tt) tt.textContent = '';
            if (ind) ind.style.display = 'none';
            if (cb) cb.style.display = 'none';
            if (expandBtn) {
                expandBtn.style.display = 'block';
                if (settings.position === 'right') {
                    expandBtn.style.right = '0';
                    expandBtn.style.left = 'auto';
                } else {
                    expandBtn.style.left = '0';
                    expandBtn.style.right = 'auto';
                }
            }
        } else {
            s.style.width = widthMap[settings.width] || '180px';
            s.style.padding = '8px 6px';
            s.style.border = `2px solid ${themeColors.border}`;
            if (settings.position === 'right') {
                s.style.borderLeft = `2px solid ${themeColors.border}`;
                s.style.borderRight = 'none';
            } else {
                s.style.borderRight = `2px solid ${themeColors.border}`;
                s.style.borderLeft = 'none';
            }
            s.style.overflow = 'hidden';
            s.style.opacity = '1';
            s.style.pointerEvents = 'auto';
            if (list) list.style.display = 'block';
            if (tb) tb.style.display = 'flex';
            if (tt) tt.textContent = '狼';
            if (ind) ind.style.display = 'inline';
            if (cb) cb.style.display = 'block';
            if (expandBtn) expandBtn.style.display = 'none';
        }
    }

    // ============================================================
    // 19. 更新指示器
    // ============================================================

    function updateIndicator() {
        const ind = document.getElementById('perspective-indicator');
        if (!ind) return;
        const themeColors = getThemeColors(settings);
        const opMode = settings.operationMode || 'quick';
        if (opMode === 'menu') {
            ind.textContent = '菜单模式';
            ind.style.color = '#66ddff';
            return;
        }
        if (currentPerspective) {
            const p = cachedPlayers.find(x => x.id === currentPerspective);
            ind.textContent = `视角 ${p ? p.name : currentPerspective}`;
            ind.style.color = themeColors.view || '#66ddff';
        } else {
            ind.textContent = '全局';
            ind.style.color = themeColors.mark || '#ffaa66';
        }
    }

    // ============================================================
    // 20. 刷新
    // ============================================================

    function refreshAll() {
        cachedJobList = extractJobList();
        if (cachedJobList.length > 0) {
            store.setJobColors(generateJobColors(cachedJobList));
        }
        const players = findPlayers();
        if (players.length > 0) {
            cachedPlayers = players;
            updateIndicator();
            renderPlayerList(players);
            try {
                if (document.getElementById('werewolf-preview-container')) {
                    updatePreviewWindow({ preserveEdits: true });
                }
            } catch(e) {}
        } else {
            cachedPlayers = [];
            const list = document.getElementById('werewolf-player-list');
            if (list) list.innerHTML = '<div style="color:#ff8844;text-align:center;padding:10px;font-size:10px;">未找到玩家</div>';
        }
    }

    // ============================================================
    // 21. 渲染玩家列表
    // ============================================================

    function renderPlayerList(players, settingsOverride) {
        const container = document.getElementById('werewolf-player-list');
        if (!container) return;
        if (!players || players.length === 0) {
            container.innerHTML = '<div style="color:#666;text-align:center;padding:10px;font-size:10px;">暂无玩家</div>';
            return;
        }

        const activeSettings = settingsOverride || settings;
        const fontSize = Number(activeSettings.baseFontSize) || 11;
        const deathOpacity = Number(activeSettings.deathOpacity) || 0.5;
        const opMode = activeSettings.operationMode || 'quick';
        const containerHeight = container.clientHeight || 300;
        const lineHeight = calcLineHeight(players.length, fontSize, containerHeight);

        const frag = document.createDocumentFragment();
        const data = store.get();
        if (!data.identity) data.identity = {};
        if (!data.action) data.action = {};
        const theme = getCurrentTheme(activeSettings);
        const themeColors = getThemeColors(activeSettings);
        const dividerColor = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
        const MARK_COLOR = themeColors.mark || '#ffaa66';
        const VIEW_COLOR = themeColors.view || '#66ddff';

        // --- 构建标记映射 ---
        let targetMarkMap = {};

        if (opMode === 'menu') {
            // 菜单模式：收集所有来源的标记
            for (const operatorId in data.action) {
                const actionData = data.action[operatorId];
                if (!actionData) continue;

                if (actionData.targets) {
                    for (const entry of actionData.targets) {
                        if (!targetMarkMap[entry.target]) {
                            targetMarkMap[entry.target] = [];
                        }
                        const existing = targetMarkMap[entry.target].find(
                            m => m.operator === operatorId && !m.isDeath
                        );
                        if (existing) {
                            existing.symbol = entry.symbol;
                        } else {
                            targetMarkMap[entry.target].push({
                                operator: operatorId,
                                symbol: entry.symbol,
                                isDeath: false
                            });
                        }
                    }
                }

                if (actionData.death) {
                    const opPlayer = cachedPlayers.find(p => p.id === operatorId);
                    if (opPlayer) {
                        const targetName = opPlayer.name;
                        if (!targetMarkMap[targetName]) {
                            targetMarkMap[targetName] = [];
                        }
                        const existing = targetMarkMap[targetName].find(
                            m => m.operator === operatorId && m.isDeath
                        );
                        if (existing) {
                            existing.symbol = actionData.death;
                        } else {
                            targetMarkMap[targetName].push({
                                operator: operatorId,
                                symbol: actionData.death,
                                isDeath: true
                            });
                        }
                    }
                }
            }
        } else if (currentPerspective === null) {
            // 快速模式-全局视角：收集所有视角的标记（与菜单模式一致）
            for (const perspective in data.action) {
                const actionData = data.action[perspective];
                if (!actionData) continue;

                if (actionData.targets) {
                    for (const entry of actionData.targets) {
                        if (!targetMarkMap[entry.target]) {
                            targetMarkMap[entry.target] = [];
                        }
                        const existing = targetMarkMap[entry.target].find(
                            m => m.operator === perspective && !m.isDeath
                        );
                        if (existing) {
                            existing.symbol = entry.symbol;
                        } else {
                            targetMarkMap[entry.target].push({
                                operator: perspective,
                                symbol: entry.symbol,
                                isDeath: false
                            });
                        }
                    }
                }

                if (actionData.death) {
                    const opPlayer = cachedPlayers.find(p => p.id === perspective);
                    if (opPlayer) {
                        const targetName = opPlayer.name;
                        if (!targetMarkMap[targetName]) {
                            targetMarkMap[targetName] = [];
                        }
                        const existing = targetMarkMap[targetName].find(
                            m => m.operator === perspective && m.isDeath
                        );
                        if (existing) {
                            existing.symbol = actionData.death;
                        } else {
                            targetMarkMap[targetName].push({
                                operator: perspective,
                                symbol: actionData.death,
                                isDeath: true
                            });
                        }
                    }
                }
            }
        } else {
            // 快速模式-玩家视角：只收集当前视角的标记
            const actionData = data.action[currentPerspective];
            if (actionData) {
                if (actionData.targets) {
                    for (const entry of actionData.targets) {
                        targetMarkMap[entry.target] = entry.symbol;
                    }
                }
                if (actionData.death) {
                    targetMarkMap['自己'] = actionData.death;
                }
            }
        }

        function getOperatorHistory(operatorId) {
            const actionData = data.action[operatorId];
            if (!actionData || !actionData.targets) return [];
            return actionData.targets;
        }

        players.forEach((player, index) => {
            const isSelf = (currentPerspective === player.id);
            const opModeMenu = (opMode === 'menu');

            let identity = null;
            if (opModeMenu) {
                identity = store.getIdentity('global', player.id);
            } else if (currentPerspective === null) {
                identity = store.getIdentity('global', player.id);
            } else {
                identity = store.getIdentity(currentPerspective, player.id);
                if (!identity) {
                    identity = store.getIdentity('global', player.id);
                }
            }
            const color = identity ? getJobColor(identity, activeSettings) : '#888';

            let markSymbol = null;
            let markCount = null;

            if (opModeMenu) {
                // 菜单模式：显示所有来源的符号组合
                const marks = targetMarkMap[player.name] || [];
                if (marks.length > 0) {
                    markSymbol = marks.map(m => m.symbol).join('');
                }
            } else if (currentPerspective === null) {
                // 快速模式-全局视角：显示所有来源的符号组合（与菜单模式一致）
                const marks = targetMarkMap[player.name] || [];
                if (marks.length > 0) {
                    markSymbol = marks.map(m => m.symbol).join('');
                }
            } else if (isSelf && currentPerspective !== null && targetMarkMap['自己']) {
                markSymbol = targetMarkMap['自己'];
            } else if (targetMarkMap[player.name]) {
                markSymbol = targetMarkMap[player.name];
                if (currentPerspective !== null && !opModeMenu) {
                    const history = getOperatorHistory(currentPerspective);
                    const idx = history.findIndex(e => e.target === player.name);
                    if (idx !== -1) {
                        markCount = idx + 1;
                    }
                }
            }

            const item = document.createElement('div');
            item.dataset.playerId = player.id;
            item.dataset.playerName = player.name;
            const isLast = index === players.length - 1;
            item.style.cssText = `
                display:flex;align-items:center;padding:1px 3px;margin:0;
                border-radius:2px;
                background:${isSelf ? themeColors.highlight : 'transparent'};
                border-left:2px solid ${isSelf ? VIEW_COLOR : 'transparent'};
                border-bottom:${isLast ? 'none' : '1px solid ' + dividerColor};
                cursor:pointer;font-size:${fontSize}px;gap:3px;
                ${player.isDead ? `opacity:${deathOpacity};` : ''}
                transition:background 0.1s;min-height:${lineHeight}px;line-height:${lineHeight}px;
                user-select:none;position:relative;
            `;

            const leftMark = document.createElement('span');
            leftMark.style.cssText = `
                font-size:${fontSize}px;flex-shrink:0;font-weight:900;
                min-width:16px;text-align:center;
                color:${MARK_COLOR};
                font-family:'Arial','Segoe UI Symbol',sans-serif;
                line-height:${lineHeight}px;
            `;

            let leftText = '';
            if (opModeMenu) {
                // 菜单模式：左侧显示所有来源的符号组合
                if (markSymbol) {
                    leftText = markSymbol;
                } else if (!identity) {
                    leftText = '';
                }
            } else if (currentPerspective === null) {
                // 快速模式-全局视角：显示所有来源的符号组合（与菜单模式一致）
                if (markSymbol) {
                    leftText = markSymbol;
                } else if (!identity) {
                    leftText = '';
                }
            } else {
                // 快速模式-玩家视角
                if (markSymbol) {
                    if (markCount !== null && markSymbol !== '×（处刑）' && markSymbol !== '×（夜死）') {
                        leftText = markSymbol + markCount;
                    } else {
                        leftText = markSymbol;
                    }
                } else {
                    leftText = '';
                }
            }
            leftMark.textContent = leftText;
            item.appendChild(leftMark);

            const nameSpan = document.createElement('span');
            const finalColor = player.isDead ? '#555555' : color;
            nameSpan.style.cssText = `
                flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                color:${finalColor};font-size:${fontSize}px;line-height:${lineHeight}px;
                font-weight:${identity ? 'bold' : 'normal'};
            `;
            nameSpan.textContent = player.name;
            item.appendChild(nameSpan);

            // 右侧显示身份名或标记
            if (identity) {
                const s = document.createElement('span');
                s.style.cssText = `font-size:${Math.max(fontSize - 2, 7)}px;color:${color};flex-shrink:0;font-weight:bold;line-height:${lineHeight}px;`;
                s.textContent = identity;
                item.appendChild(s);
            } else if (opModeMenu) {
                // 菜单模式：无身份时右侧不重复显示标记（左侧已显示）
                // 无额外操作
            } else if (currentPerspective === null) {
                // 快速模式-全局视角：无身份时右侧不重复显示标记（左侧已显示）
                // 无额外操作
            } else if (currentPerspective !== null && markSymbol && !identity) {
                // 快速模式-玩家视角：右侧显示标记
                const s = document.createElement('span');
                s.style.cssText = `
                    font-size:${fontSize}px;flex-shrink:0;font-weight:900;
                    color:${MARK_COLOR};line-height:${lineHeight}px;
                    font-family:'Arial','Segoe UI Symbol',sans-serif;
                `;
                if (markCount !== null && markSymbol !== '×（处刑）' && markSymbol !== '×（夜死）') {
                    s.textContent = markSymbol + markCount;
                } else {
                    s.textContent = markSymbol;
                }
                item.appendChild(s);
            }

            if (isSelf && !opModeMenu) {
                const e = document.createElement('span');
                e.textContent = 'V';
                e.style.cssText = `font-size:${Math.max(fontSize - 2, 7)}px;flex-shrink:0;color:${VIEW_COLOR};line-height:${lineHeight}px;`;
                item.appendChild(e);
            }

            const clearLongPress = () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                isLongPress = false;
            };

            if (opMode === 'menu') {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = item.dataset.playerId;
                    triggerPlayerHighlight(id);
                });

                item.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const targetId = item.dataset.playerId;
                    const targetName = item.dataset.playerName;
                    showMode2ContextMenu(e.clientX, e.clientY, targetId, targetName);
                });

                item.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                });

            } else {
                const onMouseDown = (e) => {
                    const btn = e.button;
                    if (btn === 2) {
                        isLongPress = false;
                        clearLongPress();
                        longPressTimer = setTimeout(() => {
                            isLongPress = true;
                            handleLongPress(e, btn);
                        }, LONG_PRESS_DELAY);
                    }
                };

                const onMouseUp = (e) => {
                    const btn = e.button;
                    if (btn === 2) {
                        clearLongPress();
                        if (isLongPress) {
                            isLongPress = false;
                            e.stopPropagation();
                        }
                    }
                };

                const handleLongPress = (e, btn) => {
                    const id = item.dataset.playerId;
                    const targetName = item.dataset.playerName;

                    if (currentPerspective === null) {
                        if (btn === 2) {
                            store.setIdentity('global', id, null);
                            renderPlayerList(cachedPlayers);
                            showToast('已清空身份', 800);
                        }
                        return;
                    }

                    if (btn === 2) {
                        store.clearAction(currentPerspective);
                        store.setIdentity(currentPerspective, id, null);
                        renderPlayerList(cachedPlayers);
                        showToast('已撤回 + 清空身份', 800);
                    }
                };

                item.addEventListener('click', (e) => {
                    if (isLongPress) {
                        e.stopPropagation();
                        return;
                    }
                    e.stopPropagation();
                    const id = item.dataset.playerId;
                    triggerPlayerHighlight(id);
                });

                item.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = item.dataset.playerId;
                    const isGlobal = (currentPerspective === null);
                    const isSelfClick = (currentPerspective === id);
                    const direction = e.deltaY > 0 ? 1 : -1;

                    if (isGlobal) {
                        const currentJob = store.getIdentity('global', id);
                        const nextJob = getNextJob(currentJob, direction);
                        store.setIdentity('global', id, nextJob);
                        renderPlayerList(cachedPlayers);
                        return;
                    }

                    const operatorId = currentPerspective;
                    let targetName;
                    if (isSelfClick) {
                        targetName = '自己';
                    } else {
                        targetName = item.dataset.playerName || '未知';
                    }

                    const currentEntry = store.getAction(operatorId);
                    let currentSymbol = null;
                    if (currentEntry && currentEntry.targets) {
                        const found = currentEntry.targets.find(t => t.target === targetName);
                        if (found) currentSymbol = found.symbol;
                    }
                    if (targetName === '自己' && currentEntry && currentEntry.death) {
                        currentSymbol = currentEntry.death;
                    }

                    let nextSymbol;
                    if (isSelfClick) {
                        nextSymbol = getNextResult(currentSymbol, direction);
                    } else {
                        nextSymbol = getNextDivine(currentSymbol, direction);
                    }

                    store.setAction(operatorId, targetName, nextSymbol);
                    renderPlayerList(cachedPlayers);
                }, { passive: false });

                item.addEventListener('contextmenu', (e) => {
                    if (isLongPress) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    const id = item.dataset.playerId;

                    if (currentPerspective === id) {
                        currentPerspective = null;
                        settings.perspective = null;
                        saveSettings(settings);
                        updateIndicator();
                        renderPlayerList(cachedPlayers);
                        return;
                    }

                    currentPerspective = id;
                    settings.perspective = id;
                    saveSettings(settings);
                    updateIndicator();
                    renderPlayerList(cachedPlayers);
                });

                item.addEventListener('auxclick', (e) => {
                    if (e.button !== 1) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (currentPerspective === null) return;
                    const operatorId = currentPerspective;
                    const isSelfClick = (operatorId === item.dataset.playerId);
                    let targetName;
                    if (isSelfClick) {
                        targetName = '自己';
                    } else {
                        targetName = item.dataset.playerName || '未知';
                    }
                    store.setAction(operatorId, targetName, null);
                    renderPlayerList(cachedPlayers);
                    showToast('已清空行动记录', 800);
                });

                item.addEventListener('mousedown', onMouseDown);
                item.addEventListener('mouseup', onMouseUp);
                item.addEventListener('mouseleave', clearLongPress);

                item.addEventListener('mousedown', (e) => {
                    if (e.button === 1) { e.preventDefault(); e.stopPropagation(); }
                });
            }

            item.addEventListener('mouseenter', () => {
                const v = (currentPerspective === item.dataset.playerId);
                item.style.background = v ? themeColors.highlight : themeColors.hover;
            });
            item.addEventListener('mouseleave', () => {
                const v = (currentPerspective === item.dataset.playerId);
                item.style.background = v ? themeColors.highlight : 'transparent';
            });

            frag.appendChild(item);
        });

        container.innerHTML = '';
        container.appendChild(frag);
    }

    // ============================================================
    // 22. 模式2：右键菜单
    // ============================================================

    function showMode2ContextMenu(x, y, targetId, targetName) {
        const existing = document.getElementById('mode2-context-menu');
        if (existing) existing.remove();

        const targetJob = store.getIdentity('global', targetId);
        const allPlayers = cachedPlayers;
        const allJobs = cachedJobList;

        const itemCount = targetJob ? allPlayers.length + 3 : allJobs.length;
        const estimatedHeight = Math.min(itemCount * 28 + 20, 400);
        let top = y;
        let left = x;
        if (y + estimatedHeight > window.innerHeight - 10) {
            top = window.innerHeight - 10 - estimatedHeight;
            if (top < 10) top = 10;
        }
        if (x + 160 > window.innerWidth - 10) {
            left = window.innerWidth - 10 - 160;
            if (left < 10) left = 10;
        }

        const menu = document.createElement('div');
        menu.id = 'mode2-context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${left}px;
            top: ${top}px;
            background: #2a2a3a;
            border: 1px solid #4a4a6a;
            border-radius: 4px;
            padding: 4px 0;
            z-index: 10001;
            min-width: 140px;
            max-height: ${Math.min(estimatedHeight, 400)}px;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            font-family: 'Microsoft YaHei', sans-serif;
            font-size: 12px;
        `;

        function closeAllMenus() {
            if (menu.parentNode) menu.remove();
            document.querySelectorAll('.mode2-submenu').forEach(el => el.remove());
        }

        function createMenuItem(label, onClick, isHighlight) {
            const div = document.createElement('div');
            div.textContent = label;
            div.style.cssText = `
                padding: 4px 14px;
                cursor: pointer;
                color: ${isHighlight ? '#66ddff' : '#e0e0e0'};
                font-size: 12px;
                transition: background 0.1s;
                ${isHighlight ? 'font-weight:bold;' : ''}
            `;
            div.addEventListener('mouseenter', () => {
                div.style.background = 'rgba(100,200,255,0.1)';
            });
            div.addEventListener('mouseleave', () => {
                div.style.background = 'transparent';
            });
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                onClick();
                closeAllMenus();
            });
            return div;
        }

        function createSubMenu(label, items, isHighlight) {
            const div = document.createElement('div');
            div.textContent = label + ' ▶';
            div.style.cssText = `
                padding: 4px 14px;
                cursor: pointer;
                color: ${isHighlight ? '#66ddff' : '#e0e0e0'};
                font-size: 12px;
                transition: background 0.1s;
                ${isHighlight ? 'font-weight:bold;' : ''}
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;

            let subMenu = null;
            let closeTimeout = null;

            function createSubMenuContent() {
                document.querySelectorAll('.mode2-submenu').forEach(el => el.remove());

                const sm = document.createElement('div');
                sm.className = 'mode2-submenu';
                const rect = div.getBoundingClientRect();
                let subLeft = rect.right;
                let subTop = rect.top;
                if (rect.right + 120 > window.innerWidth) {
                    subLeft = rect.left - 120;
                }
                if (rect.bottom + items.length * 28 > window.innerHeight - 10) {
                    subTop = window.innerHeight - 10 - items.length * 28;
                    if (subTop < 10) subTop = 10;
                }
                sm.style.cssText = `
                    position: fixed;
                    left: ${subLeft}px;
                    top: ${subTop}px;
                    background: #2a2a3a;
                    border: 1px solid #4a4a6a;
                    border-radius: 4px;
                    padding: 4px 0;
                    z-index: 10002;
                    min-width: 100px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                    font-family: 'Microsoft YaHei', sans-serif;
                    font-size: 12px;
                `;

                for (const item of items) {
                    const mi = document.createElement('div');
                    mi.textContent = item.label;
                    mi.style.cssText = `
                        padding: 3px 14px;
                        cursor: pointer;
                        color: #e0e0e0;
                        font-size: 12px;
                        transition: background 0.1s;
                    `;
                    mi.addEventListener('mouseenter', () => {
                        mi.style.background = 'rgba(100,200,255,0.1)';
                    });
                    mi.addEventListener('mouseleave', () => {
                        mi.style.background = 'transparent';
                    });
                    mi.addEventListener('click', (e) => {
                        e.stopPropagation();
                        item.onClick();
                        closeAllMenus();
                    });
                    sm.appendChild(mi);
                }
                return sm;
            }

            function openSubMenu() {
                if (closeTimeout) {
                    clearTimeout(closeTimeout);
                    closeTimeout = null;
                }
                if (subMenu) {
                    subMenu.remove();
                    subMenu = null;
                }
                subMenu = createSubMenuContent();
                document.body.appendChild(subMenu);
                subMenu.addEventListener('mouseenter', () => {
                    if (closeTimeout) {
                        clearTimeout(closeTimeout);
                        closeTimeout = null;
                    }
                });
                subMenu.addEventListener('mouseleave', () => {
                    closeTimeout = setTimeout(() => {
                        if (subMenu) {
                            subMenu.remove();
                            subMenu = null;
                        }
                        closeTimeout = null;
                    }, 300);
                });
            }

            div.addEventListener('mouseenter', () => {
                if (closeTimeout) {
                    clearTimeout(closeTimeout);
                    closeTimeout = null;
                }
                setTimeout(() => {
                    if (div.matches(':hover')) {
                        openSubMenu();
                    }
                }, 150);
            });

            div.addEventListener('mouseleave', (e) => {
                if (subMenu && subMenu.contains(e.relatedTarget)) {
                    return;
                }
                closeTimeout = setTimeout(() => {
                    if (subMenu && !subMenu.matches(':hover')) {
                        subMenu.remove();
                        subMenu = null;
                    }
                    closeTimeout = null;
                }, 300);
            });

            div.addEventListener('click', (e) => {
                e.stopPropagation();
                if (subMenu) {
                    subMenu.remove();
                    subMenu = null;
                } else {
                    openSubMenu();
                }
            });

            return div;
        }

        if (!targetJob) {
            for (const job of allJobs) {
                const isHighlight = (job === '村人');
                menu.appendChild(createMenuItem(job, () => {
                    store.setIdentity('global', targetId, job);
                    renderPlayerList(cachedPlayers);
                    showToast(`${targetName} → ${job}`, 800);
                }, isHighlight));
            }
        } else {
            const selfItems = [
                { label: '×（处刑）', onClick: () => {
                    store.setAction(targetId, '自己', '×（处刑）');
                    renderPlayerList(cachedPlayers);
                    showToast(`${targetName} 标记为处刑`, 800);
                }},
                { label: '×（夜死）', onClick: () => {
                    store.setAction(targetId, '自己', '×（夜死）');
                    renderPlayerList(cachedPlayers);
                    showToast(`${targetName} 标记为夜死`, 800);
                }},
                { label: '清除', onClick: () => {
                    store.setAction(targetId, '自己', null);
                    renderPlayerList(cachedPlayers);
                    showToast(`已清除 ${targetName} 的死亡标记`, 800);
                }}
            ];
            menu.appendChild(createSubMenu(targetName, selfItems, true));

            const divider = document.createElement('div');
            divider.style.cssText = 'border-top:1px solid #4a4a6a;margin:4px 8px;';
            menu.appendChild(divider);

            for (const p of allPlayers) {
                if (p.id === targetId) continue;
                const items = [
                    { label: '○', onClick: () => {
                        store.setAction(targetId, p.name, '○');
                        renderPlayerList(cachedPlayers);
                        showToast(`${targetName} → ${p.name} ○`, 800);
                    }},
                    { label: '●', onClick: () => {
                        store.setAction(targetId, p.name, '●');
                        renderPlayerList(cachedPlayers);
                        showToast(`${targetName} → ${p.name} ●`, 800);
                    }},
                    { label: '清除', onClick: () => {
                        store.setAction(targetId, p.name, null);
                        renderPlayerList(cachedPlayers);
                        showToast(`已清除 ${targetName} → ${p.name}`, 800);
                    }}
                ];
                menu.appendChild(createSubMenu(p.name, items, false));
            }

            const divider2 = document.createElement('div');
            divider2.style.cssText = 'border-top:1px solid #4a4a6a;margin:4px 8px;';
            menu.appendChild(divider2);

            menu.appendChild(createMenuItem('清除职业', () => {
                store.setIdentity('global', targetId, null);
                renderPlayerList(cachedPlayers);
                showToast(`已清除 ${targetName} 的职业`, 800);
            }, false));
        }

        document.body.appendChild(menu);

        const closeOnClickOutside = (e) => {
            if (!menu.contains(e.target)) {
                closeAllMenus();
                document.removeEventListener('click', closeOnClickOutside);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', closeOnClickOutside);
        }, 10);
    }

    // ============================================================
    // 23. 初始化
    // ============================================================

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (settings.theme === 'system') {
            applySettingsToSidebar();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
            e.preventDefault();
            openSettings();
        }
    });

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createSidebar);
        } else {
            createSidebar();
        }
    }

    init();

})();
