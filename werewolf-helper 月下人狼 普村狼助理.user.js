// ==UserScript==
// @name         月下人狼 普村狼助理
// @namespace    hbser3@gmail.com
// @version      0.8.5
// @description  玩家侧边栏：身份轮换/视角切换/占卜记录/灰区标记/导出表格
// @author       hbser
// @match        https://www.werewolf.com.cn/room/*
// @grant        GM_setValue
// @grant        GM_getValue
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

    const store = {
        get() {
            const all = GM_getValue('werewolf_notes_v29', {});
            if (!all[ROOM_ID]) {
                all[ROOM_ID] = { identity: {}, action: {}, jobColors: {} };
            }
            return all[ROOM_ID];
        },
        set(data) {
            const all = GM_getValue('werewolf_notes_v29', {});
            all[ROOM_ID] = data;
            GM_setValue('werewolf_notes_v29', all);
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
            if (!data.action[operatorId]) return {};
            return data.action[operatorId];
        },
        getActionTarget(operatorId, targetName) {
            const data = this.get();
            if (!data.action[operatorId]) return null;
            return data.action[operatorId][targetName] || null;
        },
        setAction(operatorId, targetName, symbol) {
            const data = this.get();
            if (!data.action[operatorId]) data.action[operatorId] = {};
            if (symbol === null) {
                delete data.action[operatorId][targetName];
            } else {
                data.action[operatorId][targetName] = symbol;
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
            const all = GM_getValue('werewolf_notes_v29', {});
            all[ROOM_ID] = { identity: {}, action: {}, jobColors: {} };
            GM_setValue('werewolf_notes_v29', all);
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

    function getJobColor(job) {
        if (!job) return '#888';
        return store.getJobColors()[job] || '#888';
    }

    // ============================================================
    // 3. 查找玩家
    // ============================================================

    function findPlayers() {
        const players = [];
        const seen = new Set();

        const selectors = [
            '.sc-jtRfpW',
            '.player-card',
            '[class*="player"]',
            '.sc-fYxtnH a[href^="/user/"]',
            '.log-entry a[href^="/user/"]',
            '.sidebar a[href^="/user/"]',
            '.players a[href^="/user/"]',
            'a[href^="/user/"]'
        ];

        for (const sel of selectors) {
            const elements = document.querySelectorAll(sel);
            for (const el of elements) {
                let link = el;
                if (el.tagName !== 'A') {
                    link = el.querySelector('a[href^="/user/"]');
                }
                if (!link) continue;

                const href = link.getAttribute('href');
                if (!href) continue;
                const id = href.replace(/.*\/user\//, '').split('?')[0];
                if (!id) continue;

                const name = link.textContent.trim();
                if (!name || seen.has(id)) continue;
                if (name.includes('游戏管理员') || name.includes('GM')) continue;

                seen.add(id);

                const parent = link.closest('.sc-jtRfpW, .player-card, [class*="player"]');
                let isDead = false;
                if (parent) {
                    isDead = !!parent.querySelector('img[src*="dead"]') || parent.textContent.includes('死亡');
                }

                players.push({ id, name, isDead });
            }
            if (players.length > 0) break;
        }

        return players;
    }

    // ============================================================
    // 4. 提取职业
    // ============================================================

    function extractJobList() {
        const order = [];
        const skip = ['昼', '夜', '犹豫', '投票', '时间', '阶段', '规则', '说明'];

        const logs = document.querySelectorAll('.sc-fYxtnH, .log-entry, [class*="log"]');
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
    // 5. 循环函数（双向循环）
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
        const list = ['×（处刑）', '×（袭击）', null];
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

    let currentPerspective = null;
    let isCollapsed = false;
    let cachedPlayers = [];
    let cachedJobList = [];
    let expandBtn = null;
    let toastTimer = null;

    // 长按检测
    let longPressTimer = null;
    let isLongPress = false;
    const LONG_PRESS_DELAY = 500;

    // ============================================================
    // 7. Toast 提示
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
    // 8. UI 创建
    // ============================================================

    function createSidebar() {
        if (document.getElementById('werewolf-sidebar')) return;

        const sidebar = document.createElement('div');
        sidebar.id = 'werewolf-sidebar';
        sidebar.style.cssText = `
            position:fixed;left:0;top:60px;width:180px;
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
        exportBtn.textContent = '导出';
        exportBtn.style.cssText = btnStyle + 'background:#2a3a5a;border-color:#4a6a8a;';
        exportBtn.addEventListener('click', exportTable);

        const resetBtn = document.createElement('button');
        resetBtn.textContent = '重置';
        resetBtn.style.cssText = btnStyle + 'background:#3a2a3a;border-color:#6a4a4a;flex:0.5;';
        resetBtn.addEventListener('click', () => {
            store.clearAll();
            currentPerspective = null;
            cachedJobList = [];
            cachedPlayers = [];
            updateIndicator();
            renderPlayerList([]);
            showToast('已重置', 1500);
        });

        const collapseBtn = document.createElement('button');
        collapseBtn.id = 'werewolf-collapse-btn';
        collapseBtn.textContent = '<';
        collapseBtn.style.cssText = btnStyle + 'flex:0.4;';
        collapseBtn.addEventListener('click', toggleSidebar);

        toolbar.append(refreshBtn, exportBtn, resetBtn, collapseBtn);
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

        setTimeout(refreshAll, 500);
    }

    // ============================================================
    // 9. 收起/展开
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
            if (expandBtn) { expandBtn.style.display = 'block'; expandBtn.style.left = '0px'; }
        } else {
            s.style.width = '180px';
            s.style.padding = '8px 6px';
            s.style.border = '2px solid #4a4a6a';
            s.style.borderLeft = 'none';
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
    // 10. 更新指示器
    // ============================================================

    function updateIndicator() {
        const ind = document.getElementById('perspective-indicator');
        if (!ind) return;
        if (currentPerspective) {
            const p = cachedPlayers.find(x => x.id === currentPerspective);
            ind.textContent = `视角 ${p ? p.name : currentPerspective}`;
            ind.style.color = '#66ddff';
        } else {
            ind.textContent = '全局';
            ind.style.color = '#ffaa66';
        }
    }

    // ============================================================
    // 11. 刷新
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
        } else {
            cachedPlayers = [];
            const list = document.getElementById('werewolf-player-list');
            if (list) list.innerHTML = '<div style="color:#ff8844;text-align:center;padding:10px;font-size:10px;">未找到玩家</div>';
        }
    }

    // ============================================================
    // 12. 渲染玩家列表
    // ============================================================

    function renderPlayerList(players) {
        const container = document.getElementById('werewolf-player-list');
        if (!container) return;
        if (!players || players.length === 0) {
            container.innerHTML = '<div style="color:#666;text-align:center;padding:10px;font-size:10px;">暂无玩家</div>';
            return;
        }

        const frag = document.createDocumentFragment();

        const data = store.get();

        // 收集标记符号
        // 全局视角：综合所有视角，包括 '自己'
        // 玩家视角：只取当前视角，包括 '自己'
        let targetMarkMap = {};
        if (currentPerspective === null) {
            for (const perspective in data.action) {
                for (const targetName in data.action[perspective]) {
                    targetMarkMap[targetName] = data.action[perspective][targetName];
                }
            }
        } else {
            const actionMap = data.action[currentPerspective] || {};
            for (const targetName in actionMap) {
                targetMarkMap[targetName] = actionMap[targetName];
            }
        }

        // ○● 统一橙色
        const MARK_COLOR = '#ffaa66';

        for (const player of players) {
            const isSelf = (currentPerspective === player.id);

            // 身份读取：全局视角读 global，玩家视角读当前视角
            let identity = null;
            if (currentPerspective === null) {
                identity = store.getIdentity('global', player.id);
            } else {
                identity = store.getIdentity(currentPerspective, player.id);
                if (!identity) {
                    identity = store.getIdentity('global', player.id);
                }
            }
            const color = identity ? getJobColor(identity) : '#888';

            // 该玩家被标记的符号
            let markSymbol = null;
            if (isSelf && currentPerspective !== null && targetMarkMap['自己']) {
                markSymbol = targetMarkMap['自己'];
            } else {
                markSymbol = targetMarkMap[player.name] || null;
            }

            const item = document.createElement('div');
            item.dataset.playerId = player.id;
            item.dataset.playerName = player.name;
            item.style.cssText = `
                display:flex;align-items:center;padding:1px 3px;margin:1px 0;
                border-radius:2px;
                background:${isSelf ? 'rgba(100,200,255,0.08)' : 'transparent'};
                border-left:2px solid ${isSelf ? '#66ddff' : 'transparent'};
                cursor:pointer;font-size:11px;gap:3px;
                ${player.isDead ? 'opacity:0.3;' : ''}
                transition:background 0.1s;min-height:18px;
                user-select:none;
                position:relative;
            `;

            // ---- 左侧标记 ----
            const leftMark = document.createElement('span');
            leftMark.style.cssText = `
                font-size:13px;flex-shrink:0;font-weight:900;
                min-width:16px;text-align:center;
                color:${MARK_COLOR};
                font-family:'Arial','Segoe UI Symbol',sans-serif;
            `;

            if (currentPerspective === null) {
                if (!identity && markSymbol) {
                    leftMark.textContent = '○';
                } else {
                    leftMark.textContent = '';
                }
            } else {
                if (markSymbol) {
                    leftMark.textContent = markSymbol;
                } else {
                    leftMark.textContent = '';
                }
            }
            item.appendChild(leftMark);

            // ---- 玩家名 ----
            const nameSpan = document.createElement('span');
            nameSpan.style.cssText = `flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${color};font-size:11px;font-weight:${identity ? 'bold' : 'normal'};`;
            nameSpan.textContent = player.name;
            item.appendChild(nameSpan);

            // ---- 右侧显示 ----
            if (identity) {
                const s = document.createElement('span');
                s.style.cssText = `font-size:8px;color:${color};flex-shrink:0;font-weight:bold;`;
                s.textContent = identity;
                item.appendChild(s);
            } else if (currentPerspective === null && markSymbol) {
                const s = document.createElement('span');
                s.style.cssText = `
                    font-size:13px;flex-shrink:0;font-weight:900;
                    color:${MARK_COLOR};
                    font-family:'Arial','Segoe UI Symbol',sans-serif;
                `;
                s.textContent = '○';
                item.appendChild(s);
            } else if (currentPerspective !== null && markSymbol && !identity) {
                const s = document.createElement('span');
                s.style.cssText = `
                    font-size:13px;flex-shrink:0;font-weight:900;
                    color:${MARK_COLOR};
                    font-family:'Arial','Segoe UI Symbol',sans-serif;
                `;
                s.textContent = markSymbol;
                item.appendChild(s);
            }

            // ---- 当前视角标识 ----
            if (isSelf) {
                const e = document.createElement('span');
                e.textContent = 'V';
                e.style.cssText = 'font-size:8px;flex-shrink:0;color:#66ddff;';
                item.appendChild(e);
            }

            // ---- 长按辅助函数 ----
            const clearLongPress = () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                isLongPress = false;
            };

            const onMouseDown = (e) => {
                const btn = e.button;
                if (btn === 0 || btn === 2) {
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
                if (btn === 0 || btn === 2) {
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
                    if (btn === 0) {
                        store.setIdentity('global', id, null);
                        renderPlayerList(cachedPlayers);
                        showToast('已清空身份', 800);
                    }
                    return;
                }

                if (btn === 0) {
                    store.setIdentity(currentPerspective, id, null);
                    renderPlayerList(cachedPlayers);
                    showToast('已清空身份', 800);
                } else if (btn === 2) {
                    store.setAction(currentPerspective, targetName, null);
                    store.setIdentity(currentPerspective, id, null);
                    renderPlayerList(cachedPlayers);
                    showToast('已撤回 + 清空身份', 800);
                }
            };

            // ---- 左键：身份轮换 ----
            item.addEventListener('click', (e) => {
                if (isLongPress) {
                    e.stopPropagation();
                    return;
                }
                e.stopPropagation();
                const id = item.dataset.playerId;

                let targetPerspective;
                if (currentPerspective === null) {
                    targetPerspective = 'global';
                } else {
                    targetPerspective = currentPerspective;
                }

                const currentJob = store.getIdentity(targetPerspective, id);
                const nextJob = getNextJob(currentJob, 1);
                store.setIdentity(targetPerspective, id, nextJob);
                renderPlayerList(cachedPlayers);
            });

            // ---- 滚轮：快速切换 ----
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

                const currentSymbol = store.getActionTarget(operatorId, targetName);

                let nextSymbol;
                if (isSelfClick) {
                    nextSymbol = getNextResult(currentSymbol, direction);
                } else {
                    nextSymbol = getNextDivine(currentSymbol, direction);
                }

                store.setAction(operatorId, targetName, nextSymbol);
                renderPlayerList(cachedPlayers);
            }, { passive: false });

            // ---- 右键：视角切换 ----
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
                    updateIndicator();
                    renderPlayerList(cachedPlayers);
                    return;
                }

                currentPerspective = id;
                updateIndicator();
                renderPlayerList(cachedPlayers);
            });

            // ---- 中键：清空行动记录 ----
            item.addEventListener('auxclick', (e) => {
                if (e.button !== 1) return;
                e.preventDefault();
                e.stopPropagation();

                if (currentPerspective === null) {
                    return;
                }

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

            item.addEventListener('mouseenter', () => {
                const v = (currentPerspective === item.dataset.playerId);
                item.style.background = v ? 'rgba(100,200,255,0.15)' : 'rgba(100,200,255,0.04)';
            });
            item.addEventListener('mouseleave', () => {
                const v = (currentPerspective === item.dataset.playerId);
                item.style.background = v ? 'rgba(100,200,255,0.08)' : 'transparent';
            });

            frag.appendChild(item);
        }

        container.innerHTML = '';
        container.appendChild(frag);
    }

    // ============================================================
    // 13. 导出
    // ============================================================

    function exportTable() {
        const players = cachedPlayers.length > 0 ? cachedPlayers : findPlayers();
        if (players.length === 0) {
            showToast('没有玩家数据', 1500);
            return;
        }

        const data = store.get();
        const allActions = {};
        for (const perspective in data.action) {
            for (const targetName in data.action[perspective]) {
                if (!allActions[perspective]) allActions[perspective] = {};
                allActions[perspective][targetName] = data.action[perspective][targetName];
            }
        }

        const groups = {};
        for (const player of players) {
            const identity = store.getIdentity('global', player.id);
            if (!identity) continue;

            if (!groups[identity]) groups[identity] = [];
            const actions = allActions[player.id] || {};
            groups[identity].push({
                name: player.name,
                actions: Object.entries(actions)
            });
        }

        let lines = [];
        for (const job of cachedJobList) {
            if (!groups[job] || groups[job].length === 0) continue;
            lines.push(`${job}（${groups[job].length}）`);
            for (const item of groups[job]) {
                const parts = item.actions.map(([target, sym]) => {
                    return target === '自己' ? sym : `${target}${sym}`;
                });
                const chain = parts.join('→');
                if (chain) {
                    lines.push(`${item.name}：${chain}`);
                } else {
                    lines.push(`${item.name}`);
                }
            }
            lines.push('');
        }

        const text = lines.join('\n');
        if (!text.trim()) {
            showToast('暂无数据', 1500);
            return;
        }

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
    }

    // ============================================================
    // 14. 初始化
    // ============================================================

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createSidebar);
        } else {
            createSidebar();
        }
    }

    init();

})();