const attachBtn = document.getElementById('attach-btn');
const messageFileInput = document.getElementById('message-file');
const messageFormEl = document.getElementById('message-form');
let attachedFiles = [];

let attachPreview = document.createElement('div');
attachPreview.className = 'attach-preview';
if (messageFormEl) messageFormEl.insertBefore(attachPreview, messageFormEl.firstChild);

if (attachBtn && messageFileInput) {
	attachBtn.onclick = () => messageFileInput.click();
	messageFileInput.onchange = function() {
		attachedFiles = Array.from(messageFileInput.files);
		renderAttachPreview();
	};
}

function renderAttachPreview() {
	attachPreview.innerHTML = '';
	attachedFiles.forEach((file, idx) => {
		const item = document.createElement('div');
		item.className = 'attach-preview-item';

		if (file.type.startsWith('image/')) {
			const img = document.createElement('img');
			img.className = 'attach-preview-img';
			img.src = URL.createObjectURL(file);
			item.appendChild(img);
		}

		const fname = document.createElement('div');
		fname.className = 'attach-preview-filename';
		fname.textContent = file.name;
		item.appendChild(fname);

		const removeBtn = document.createElement('button');
		removeBtn.className = 'attach-remove-btn';
		removeBtn.textContent = '×';
		removeBtn.onclick = () => {
			attachedFiles.splice(idx, 1);
			renderAttachPreview();
			messageFileInput.value = '';
		};
		item.appendChild(removeBtn);
		attachPreview.appendChild(item);
	});
	attachPreview.style.display = attachedFiles.length ? 'flex' : 'none';
}

const chatEditBtn = document.getElementById('chat-edit-btn');

const chatEditModal = document.getElementById('chat-edit-modal');
const closeChatEditModalBtn = document.getElementById('close-chat-edit-modal');
const chatEditForm = document.getElementById('chat-edit-form');
const editChatTitleInput = document.getElementById('edit-chat-title');
const editChatUsersInput = document.getElementById('edit-chat-users');
const editChatUsersList = document.getElementById('edit-chat-users-list');

let editChatUsers = [];

if (chatEditBtn) {
	chatEditBtn.onclick = function() {
		if (!currentChatId) return;
		showEditChatModal(currentChatId);
	};
}
if (closeChatEditModalBtn) {
	closeChatEditModalBtn.onclick = hideEditChatModal;
}
if (chatEditModal) {
	chatEditModal.addEventListener('mousedown', function(e) {
		if (e.target === chatEditModal || e.target.classList.contains('chat-edit-modal-backdrop')) {
			hideEditChatModal();
		}
	});
}

function showEditChatModal(chatId) {

	const chat = chats.find(c => c.id === chatId);
	if (!chat) return;
	chatEditModal.style.display = 'flex';
	editChatTitleInput.value = chat.title || '';

	fetch(`/api/messenger/chat_members?chat_id=${chatId}`)
		.then(res => res.json())
		.then(data => {
			editChatUsers = (data.members || []).map(u => u.username);
			renderEditChatUsersList();
		});
	editChatUsersInput.value = '';
}

function hideEditChatModal() {
	chatEditModal.style.display = 'none';
	editChatUsers = [];
	editChatUsersInput.value = '';
	editChatUsersList.innerHTML = '';
}

function renderEditChatUsersList() {
	editChatUsersList.innerHTML = '';
	editChatUsers.forEach(username => {
		const tag = document.createElement('span');
		tag.className = 'edit-chat-user-tag';
		tag.textContent = username;
		const removeBtn = document.createElement('button');
		removeBtn.className = 'edit-chat-user-remove';
		removeBtn.textContent = '×';
		removeBtn.onclick = () => {
			editChatUsers = editChatUsers.filter(u => u !== username);
			renderEditChatUsersList();
		};
		tag.appendChild(removeBtn);
		editChatUsersList.appendChild(tag);
	});
}

if (editChatUsersInput) {
	editChatUsersInput.addEventListener('keydown', async function(e) {
		if (e.key === 'Enter') {
			e.preventDefault();
			const username = editChatUsersInput.value.trim();
			if (!username || editChatUsers.includes(username)) return;

			const res = await fetch('/api/users');
			const data = await res.json();
			const users = data.users || [];
			if (!users.find(u => u.username === username)) {
				alert('Пользователь не найден!');
				return;
			}
			editChatUsers.push(username);
			renderEditChatUsersList();
			editChatUsersInput.value = '';
		}
	});
}

if (chatEditForm) {
	chatEditForm.onsubmit = async function(e) {
		e.preventDefault();
		const title = editChatTitleInput.value.trim();
		if (!title) {
			alert('Введите название чата');
			return;
		}

		const res = await fetch('/api/users');
		const data = await res.json();
		const users = data.users || [];
		const userIds = editChatUsers.map(username => {
			const u = users.find(u => u.username === username);
			return u ? u.id : null;
		}).filter(Boolean);

		await fetch('/api/messenger/edit_chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: currentChatId, title, user_ids: userIds })
		});
		hideEditChatModal();
		await fetchChats();
		selectChat(currentChatId);
	};
}

const chatMembersBtn = document.getElementById('chat-members-btn');
const chatMembersModal = document.getElementById('chat-members-modal');
const chatMembersList = document.getElementById('chat-members-list');
const closeChatMembersModalBtn = document.getElementById('close-chat-members-modal');

if (chatMembersBtn && chatMembersModal && chatMembersList) {
	chatMembersBtn.onclick = async function() {
		if (!currentChatId) return;
		await showChatMembersModal(currentChatId);
	};
}
if (closeChatMembersModalBtn) {
	closeChatMembersModalBtn.onclick = hideChatMembersModal;
}
if (chatMembersModal) {
	chatMembersModal.addEventListener('mousedown', function(e) {
		if (e.target === chatMembersModal || e.target.classList.contains('chat-members-modal-backdrop')) {
			hideChatMembersModal();
		}
	});
}

async function showChatMembersModal(chatId) {
	chatMembersModal.style.display = 'flex';
	chatMembersList.innerHTML = '<div style="color:#bfc9d8;padding:12px 0;">Загрузка...</div>';
	try {
		const res = await fetch(`/api/messenger/chat_members?chat_id=${chatId}`);
		const data = await res.json();
		renderChatMembersList(data.members || []);
	} catch (e) {
		chatMembersList.innerHTML = '<div style="color:#e74c3c;">Ошибка загрузки участников</div>';
	}
}

function hideChatMembersModal() {
	chatMembersModal.style.display = 'none';
}

function renderChatMembersList(members) {
	if (!members.length) {
		chatMembersList.innerHTML = '<div style="color:#bfc9d8;">Нет участников</div>';
		return;
	}
	chatMembersList.innerHTML = '';
	members.forEach(member => {
		const row = document.createElement('div');
		row.className = 'chat-member-row';
		const avatar = document.createElement('img');
		avatar.className = 'chat-member-avatar';
		avatar.src = member.avatar || '/assets/img/default-avatar.png';
		avatar.alt = 'avatar';
		const info = document.createElement('div');
		info.className = 'chat-member-info';
		const name = document.createElement('div');
		name.className = 'chat-member-name';
		name.textContent = member.username;
		const role = document.createElement('div');
		role.className = 'chat-member-role';
		role.textContent = member.role === 'admin' ? 'Админ' : 'Участник';
		info.appendChild(name);
		info.appendChild(role);
		row.appendChild(avatar);
		row.appendChild(info);
		chatMembersList.appendChild(row);
	});
}

let chats = [];
let currentChatId = null;
let currentChatTitle = '';
let currentMessages = [];
let replyToMsg = null;

// --- WebSocket для чата ---
let chatSocket = null;
function connectChatWebSocket(chatId) {
    if (chatSocket) {
        if (chatSocket.readyState === WebSocket.OPEN || chatSocket.readyState === WebSocket.CONNECTING) {
            console.log('WebSocket is already open or connecting. Skipping reconnection.');
            return;
        }
        chatSocket.onclose = null; // Убираем обработчик, чтобы избежать лишних вызовов
        chatSocket.close();
    }

    let wsPort = location.port ? location.port : '8080';
    let wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.hostname + ':' + wsPort + `/ws/chat/${chatId}`;
    chatSocket = new WebSocket(wsUrl);

    chatSocket.onopen = function() {
        console.log('WebSocket connection established');
    };

		chatSocket.onmessage = function(event) {
			try {
				const data = JSON.parse(event.data);
				if (data.type === 'new_message' && data.message) {
					// Добавляем новое сообщение в текущий чат, если chatId совпадает
					if (String(data.message.chat_id) === String(currentChatId)) {
						currentMessages.push(data.message);
						renderMessages();
					} else {
						// Показываем уведомление для других чатов, только если сообщение не от текущего пользователя
						const user = getUser();
						if (user && String(data.message.sender_id) !== String(user.id)) {
							showNotification(data.message.chat_id, data.message);
						}
					}
				}
			} catch (e) {
				console.error('Error processing WebSocket message:', e);
			}
		};

    chatSocket.onclose = function(event) {
        console.warn('WebSocket connection closed:', event);
        setTimeout(() => {
            if (String(currentChatId) === String(chatId)) {
                connectChatWebSocket(chatId); // Повторное подключение
            }
        }, 5000); // Задержка перед повторным подключением
    };

    chatSocket.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
}

function clearReplyTo() {
	replyToMsg = null;
	const replyPreview = document.getElementById('reply-preview');
	if (replyPreview) replyPreview.style.display = 'none';
}

function setReplyTo(msg) {
	replyToMsg = msg;
	const replyPreview = document.getElementById('reply-preview');
	if (!replyPreview) return;
	replyPreview.style.display = 'block';
	let text = '<b>Ответ на:</b> <span style="color:#229ed9">' + escapeHtml(msg.sender_name) + '</span> ';
	if (msg.content) text += escapeHtml(msg.content.slice(0, 80));
	if (msg.files && Array.isArray(msg.files) && msg.files.length) {
		msg.files.forEach(file => {
			if (typeof file === 'string' && (file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png') || file.endsWith('.gif') || file.endsWith('.webp'))) {
				text += `<img src="${file}" style="max-width:38px;max-height:38px;border-radius:6px;margin-left:6px;vertical-align:middle;box-shadow:0 1px 4px #0002;">`;
			} else if (typeof file === 'string') {
				const fname = file.split('/').pop();
				text += `<span style="display:inline-block;background:#202a36;color:#229ed9;border-radius:5px;padding:2px 7px;font-size:0.92em;margin-left:6px;vertical-align:middle;"><svg style="width:1em;height:1em;vertical-align:middle;margin-right:2px;opacity:0.7;" viewBox="0 0 24 24"><path fill="#229ed9" d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6zm7 1.5V9h5.5L13 3.5zM6 4h6v5a2 2 0 0 0 2 2h5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/></svg>${escapeHtml(fname)}</span>`;
			}
		});
	}
	replyPreview.innerHTML = text + '<button style="margin-left:10px;background:none;border:none;color:#e74c3c;font-size:1em;cursor:pointer;" onclick="clearReplyTo()">×</button>';
}


let chatDrafts = {};
function loadDrafts() {
	try {
		const saved = localStorage.getItem('messenger_chatDrafts');
		if (saved) chatDrafts = JSON.parse(saved);
		else chatDrafts = {};
	} catch(e) { chatDrafts = {}; }
}
function saveDrafts() {
	try { localStorage.setItem('messenger_chatDrafts', JSON.stringify(chatDrafts)); } catch(e) {}
}
loadDrafts();

const chatList = document.getElementById('chat-list');
const messagesBox = document.getElementById('messages');
const chatTitle = document.getElementById('chat-title');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const accountBar = document.getElementById('account-bar');
const newChatBtn = document.getElementById('new-chat-btn');
function renderAccountBar() {
	const user = getUser();
	if (!user) {
		accountBar.innerHTML = '<span style="color:#888">Не авторизован</span>';
		return;
	}
	const avatar = user.avatar ? user.avatar : '/assets/img/default-avatar.png';
	accountBar.innerHTML = `
		<img src="${avatar}" class="tg-account-avatar" alt="avatar" />
		<span class="tg-account-name">${escapeHtml(user.username)}</span>
	`;
	accountBar.onclick = showAccountMenu;
}

function showAccountMenu(e) {
	e.stopPropagation();
	const oldMenu = document.getElementById('account-menu');
	if (oldMenu) {

		hideAccountMenuAnimated();
		return;
	}
	const user = getUser();
	if (!user) return;
	const menu = document.createElement('div');
	menu.id = 'account-menu';
	menu.className = 'tg-account-menu';

	const btns = [
		{ text: 'Выйти', action: () => {/* TODO */} },
		{ text: 'Настройки', action: () => {/* TODO */} },
		{ text: 'Аккаунт', action: () => { window.location.href = 'account.html'; } }
	];
	btns.forEach((btn, i) => {
		const b = document.createElement('button');
		b.className = 'account-menu-btn';
		b.textContent = btn.text;
		b.onclick = (ev) => { ev.stopPropagation(); btn.action(); hideAccountMenuAnimated(); };
		b.style.opacity = '0';
		b.style.transform = 'translateY(40px)';
		menu.appendChild(b);
	});
	document.body.appendChild(menu);

	const rect = accountBar.getBoundingClientRect();
	menu.style.position = 'fixed';
	menu.style.left = rect.left + 'px';
	menu.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
	menu.style.zIndex = 1000;

	setTimeout(() => {
		const btns = menu.querySelectorAll('.account-menu-btn');
		btns.forEach((b, i) => {
			setTimeout(() => {
				b.style.transition = 'opacity 0.22s cubic-bezier(.4,2,.6,1), transform 0.22s cubic-bezier(.4,2,.6,1)';
				b.style.opacity = '1';
				b.style.transform = 'translateY(0)';
			}, 80 * i);
		});
	}, 10);

	setTimeout(() => {
		document.addEventListener('mousedown', hideAccountMenuAnimated, { once: true });
	}, 0);
}

function hideAccountMenuAnimated() {
	const menu = document.getElementById('account-menu');
	if (!menu) return;
	const btns = menu.querySelectorAll('.account-menu-btn');
	btns.forEach((b, i) => {
		setTimeout(() => {
			b.style.transition = 'opacity 0.18s cubic-bezier(.7,-0.5,1,1), transform 0.18s cubic-bezier(.7,-0.5,1,1)';
			b.style.opacity = '0';
			b.style.transform = 'translateY(60px)';
		}, 60 * i);
	});
	setTimeout(() => { if (menu) menu.remove(); }, 60 * btns.length + 120);
}

function getUser() {
	return window.getCurrentUser ? window.getCurrentUser() : null;
}

async function fetchChats() {
	const user = getUser();
	if (!user) return;
	const isAdmin = user.role === 'admin';
	const url = `/api/messenger/chats?user_id=${user.id}&is_admin=${isAdmin}`;
	const res = await fetch(url);
	let rawChats = await res.json();
	// Для каждого чата получаем последнее сообщение с нужными полями
	chats = await Promise.all(rawChats.map(async chat => {
		let lastMsg = null;
		try {
			const msgRes = await fetch(`/api/messenger/messages?chat_id=${chat.id}&user_id=${user.id}&is_admin=${isAdmin}`);
			const msgs = await msgRes.json();
			if (msgs.length) {
				const m = msgs[msgs.length - 1];
				lastMsg = {
					content: m.content,
					files: m.files || [],
					sender_id: m.sender_id,
					sender_name: m.sender_name,
					created_at: m.created_at
				};
			}
		} catch(e) {}
		return { ...chat, lastMsg };
	}));
	renderChatList();
	renderAccountBar();
	// --- Выбор чата после загрузки списка ---
	if (chats.length) {
		let hashChatId = null;
		if (window.location.hash && window.location.hash.startsWith('#chat-')) {
			const hashId = window.location.hash.replace('#chat-', '');
			if (chats.some(c => String(c.id) === hashId)) {
				hashChatId = hashId;
			}
		}
		if (hashChatId) {
			selectChat(hashChatId);
		} else {
			// Пробуем восстановить последний открытый чат
			let lastChatId = null;
			try {
				lastChatId = localStorage.getItem('lastChatId');
			} catch(e) {}
			if (lastChatId && chats.some(c => String(c.id) === lastChatId)) {
				selectChat(lastChatId);
			} else {
				selectChat(chats[0].id);
			}
		}
	}
	if (currentChatId && chats.some(c => String(c.id) === String(currentChatId))) {
		const chat = chats.find(c => String(c.id) === String(currentChatId));
		currentChatTitle = chat ? (chat.title || `Чат #${chat.id}`) : '';
		chatTitle.textContent = currentChatTitle;
		// Не вызываем selectChat, чтобы не триггерить повторную загрузку
	}
}

if (newChatBtn) {
	newChatBtn.onclick = async function() {
		const username = prompt('Введите имя пользователя для приватного чата:');
		if (!username) return;

		const res = await fetch('/api/users');
		const data = await res.json();
		const users = data.users || [];
		const target = users.find(u => u.username === username);
		if (!target) {
			alert('Пользователь не найден!');
			return;
		}
		await createPrivateChatWith(target.id);
	};
}

async function fetchMessages(chatId) {
	const user = getUser();
	if (!user) return;
	const isAdmin = user.role === 'admin';
	const url = `/api/messenger/messages?chat_id=${chatId}&user_id=${user.id}&is_admin=${isAdmin}`;
	const res = await fetch(url);
	currentMessages = await res.json();
	renderMessages();
}

function renderChatList() {
	chatList.innerHTML = '';
	const user = getUser();
	chats.forEach(chat => {
		const li = document.createElement('li');
		li.className = chat.id === currentChatId ? 'active' : '';
		li.onclick = () => selectChat(chat.id);
		// Заголовок чата
		const titleDiv = document.createElement('div');
		titleDiv.textContent = chat.title || `Чат #${chat.id}`;
		titleDiv.style.fontWeight = 'bold';
		li.appendChild(titleDiv);
		// --- Badge непрочитанных сообщений ---
		if (chat.unread_count && chat.unread_count > 0) {
			const badge = document.createElement('span');
			badge.className = 'unread-badge';
			badge.textContent = chat.unread_count > 99 ? '99+' : chat.unread_count;
			badge.title = 'Непрочитанные сообщения';
			li.appendChild(badge);
		}
		// Превью последнего сообщения только если оно есть
		if (chat.lastMsg) {
			const preview = document.createElement('div');
			preview.className = 'chat-preview';
			let text = '';
			if (user && chat.lastMsg.sender_id === user.id) {
				text += 'Вы: ';
			} else if (chat.lastMsg.sender_name) {
				text += chat.lastMsg.sender_name + ': ';
			}
			if (chat.lastMsg.content) {
				text += chat.lastMsg.content.slice(0, 40);
			}
			if (chat.lastMsg.files && chat.lastMsg.files.length) {
				let filesHtml = '';
				chat.lastMsg.files.forEach(file => {
					if (typeof file === 'string' && (file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png') || file.endsWith('.gif') || file.endsWith('.webp'))) {
						filesHtml += `<img src="${file}" style="max-width:38px;max-height:38px;border-radius:6px;margin-left:6px;vertical-align:middle;box-shadow:0 1px 4px #0002;">`;
					} else if (typeof file === 'string') {
						const fname = file.split('/').pop();
						filesHtml += `<span style="display:inline-block;background:#202a36;color:#229ed9;border-radius:5px;padding:2px 7px;font-size:0.92em;margin-left:6px;vertical-align:middle;"><svg style="width:1em;height:1em;vertical-align:middle;margin-right:2px;opacity:0.7;" viewBox="0 0 24 24"><path fill='#229ed9' d='M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6zm7 1.5V9h5.5L13 3.5zM6 4h6v5a2 2 0 0 0 2 2h5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z'/></svg>${escapeHtml(fname)}</span>`;
					}
				});
				text += filesHtml;
			}
			preview.innerHTML = text;
			preview.style.color = '#bfc9d8';
			preview.style.fontSize = '0.95em';
			li.appendChild(preview);
		}
		chatList.appendChild(li);
	});
}

function renderMessages() {
	messagesBox.innerHTML = '';
	const user = getUser();
	if (!currentChatId) return;
	currentMessages.forEach(msg => {
		const div = document.createElement('div');
		div.className = 'tg-message' + (msg.sender_id === user.id ? ' out' : '');
		// --- Парсинг файлов ---
		let content = msg.content || '';
		let files = [];
		let fileBlock = '';

		const filesMatch = content.match(/\[files\](.*)$/s);
		if (filesMatch) {

			const filesStr = filesMatch[1].trim();
			files = filesStr.split(/,\s*/).filter(Boolean);
			content = content.replace(/\n?\[files\].*$/s, '').trim();
		}

		if (files.length) {
			fileBlock = '<div class="msg-files">';
			files.forEach(url => {
				const ext = url.split('.').pop().toLowerCase();
				if (["jpg","jpeg","png","gif","webp","bmp"].includes(ext)) {
					fileBlock += `<a href="${url}" target="_blank"><img src="${url}" class="msg-file-img" alt="img" /></a>`;
				} else {
					const fname = url.split('/').pop();
					fileBlock += `<a href="${url}" target="_blank" class="msg-file-link">📎 ${fname}</a>`;
				}
			});
			fileBlock += '</div>';
		}

		if (msg.reply_to) {
			const repliedMsg = currentMessages.find(m => m.id == msg.reply_to);
			if (repliedMsg) {
				const replyDiv = document.createElement('div');
				replyDiv.className = 'msg-reply-preview';
				replyDiv.style.background = '#232e3c';
				replyDiv.style.borderRadius = '8px';
				replyDiv.style.padding = '4px 10px';
				replyDiv.style.marginBottom = '4px';
				replyDiv.style.fontSize = '0.95em';
				replyDiv.style.color = '#bfc9d8';

				let replyHtml = `<span style="font-weight:500;">${escapeHtml(repliedMsg.sender_name)}:</span> `;
				let replyContent = repliedMsg.content || '';
				let replyFiles = [];
				const filesMatch = replyContent.match(/\[files\](.*)$/s);
				if (filesMatch) {
					replyFiles = filesMatch[1].trim().split(/,\s*/).filter(Boolean);
					replyContent = replyContent.replace(/\n?\[files\].*$/s, '').trim();
				}
				if (replyContent) {
					replyHtml += escapeHtml(replyContent).slice(0, 48);
					if (replyContent.length > 48) replyHtml += '…';
				}
				if (replyFiles.length) {
					replyFiles.forEach(file => {
						if (typeof file === 'string' && (file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png') || file.endsWith('.gif') || file.endsWith('.webp'))) {
							replyHtml += `<img src="${file}" style="max-width:32px;max-height:32px;border-radius:5px;margin-left:6px;vertical-align:middle;box-shadow:0 1px 4px #0002;">`;
						} else if (typeof file === 'string') {
							const fname = file.split('/').pop();
							replyHtml += `<span style="display:inline-block;background:#202a36;color:#229ed9;border-radius:5px;padding:2px 7px;font-size:0.92em;margin-left:6px;vertical-align:middle;"><svg style="width:1em;height:1em;vertical-align:middle;margin-right:2px;opacity:0.7;" viewBox="0 0 24 24"><path fill='#229ed9' d='M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6zm7 1.5V9h5.5L13 3.5zM6 4h6v5a2 2 0 0 0 2 2h5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z'/></svg>${escapeHtml(fname)}</span>`;
						}
					});
				}
				replyDiv.innerHTML = replyHtml;
				div.appendChild(replyDiv);
			}
		}

		let localTime = '';
		if (msg.created_at) {
			let dt = new Date(msg.created_at.replace(' ', 'T') + 'Z');
			const now = new Date();
			if (dt.toDateString() === now.toDateString()) {
				localTime = dt.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
			} else {
				localTime = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
			}
		}
		div.innerHTML += `<b>${escapeHtml(msg.sender_name)}:</b> ${escapeHtml(content)}${fileBlock}`;

		if (localTime) {
			const timeDiv = document.createElement('div');
			timeDiv.className = 'msg-time';
			timeDiv.textContent = localTime;
			timeDiv.style.position = 'absolute';
			timeDiv.style.right = '12px';
			timeDiv.style.bottom = '6px';
			timeDiv.style.fontSize = '0.82em';
			timeDiv.style.color = '#bfc9d8';
			timeDiv.style.opacity = '0.7';
			div.style.position = 'relative';
			div.appendChild(timeDiv);
		}

		let controlsDiv = null;
		function showControls(e) {
			e.preventDefault();
			// Удалить старое меню
			document.querySelectorAll('.msg-controls').forEach(el => el.remove());
			controlsDiv = document.createElement('div');
			controlsDiv.className = 'msg-controls';
			controlsDiv.style.position = 'absolute';
			controlsDiv.style.right = '8px';
			controlsDiv.style.top = '8px';
			controlsDiv.style.background = '#232e3c';
			controlsDiv.style.borderRadius = '8px';
			controlsDiv.style.boxShadow = '0 2px 12px #0006';
			controlsDiv.style.display = 'flex';
			controlsDiv.style.gap = '6px';
			controlsDiv.style.padding = '4px 10px';
			controlsDiv.style.zIndex = '10';
			controlsDiv.style.alignItems = 'center';

			if (msg.sender_id === user.id || user.role === 'admin') {
				const delBtn = document.createElement('button');
				delBtn.textContent = '✖';
				delBtn.className = 'msg-del-btn';
				delBtn.onclick = (ev) => { ev.stopPropagation(); deleteMessage(msg.id); controlsDiv.remove(); };
				controlsDiv.appendChild(delBtn);
			}

			const replyBtn = document.createElement('button');
			replyBtn.className = 'msg-reply-btn';
			replyBtn.innerHTML = '↩';
			replyBtn.title = 'Ответить';
			replyBtn.onclick = (ev) => { ev.stopPropagation(); setReplyTo(msg); controlsDiv.remove(); };
			controlsDiv.appendChild(replyBtn);
			// Добавить меню к сообщению
			div.appendChild(controlsDiv);
			// Закрыть меню при клике вне
			setTimeout(() => {
				document.addEventListener('mousedown', function handler(ev) {
					if (!controlsDiv.contains(ev.target)) {
						controlsDiv.remove();
						document.removeEventListener('mousedown', handler);
					}
				});
			}, 0);
		}
		div.oncontextmenu = showControls;
		messagesBox.appendChild(div);
	});

	messagesBox.scrollTop = messagesBox.scrollHeight;
}

function escapeHtml(text) {
	return text.replace(/[&<>"']/g, function (c) {
		return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
	});
}

async function selectChat(id) {
	// Сохраняем черновик для текущего чата
	if (currentChatId !== null) {
		chatDrafts[currentChatId] = messageInput.value;
		saveDrafts();
	}
	currentChatId = id;
	connectChatWebSocket(id);
	// Сохраняем последний открытый чат
	try { localStorage.setItem('messenger_lastChat', String(id)); } catch(e) {}
	// Обновляем hash в адресе
	if (history.replaceState) {
		history.replaceState(null, '', '#chat-' + id);
	} else {
		location.hash = '#chat-' + id;
	}
	const chat = chats.find(c => c.id === id);
	currentChatTitle = chat ? (chat.title || `Чат #${chat.id}`) : '';
	chatTitle.textContent = currentChatTitle;
	await fetchMessages(id);
	// --- Отмечаем чат как прочитанный ---
	const user = getUser();
	if (chat && user) {
		// Найти максимальный id чужого сообщения
		let maxOtherMsgId = 0;
		for (let i = currentMessages.length - 1; i >= 0; i--) {
			const msg = currentMessages[i];
			if (msg.sender_id !== user.id) {
				maxOtherMsgId = msg.id;
				break;
			}
		}
		if (maxOtherMsgId > 0) {
			try {
				await fetch('/api/messenger/read_chat', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ chat_id: id, user_id: user.id, last_msg_id: maxOtherMsgId })
				});
			} catch(e) {}
			// После отметки обновляем только список чатов и badge, не сбрасываем выбор
			await fetchChats();
			// Восстановить выбранный чат и заголовок
			currentChatId = id;
			chatTitle.textContent = currentChatTitle;
		} else {
			renderChatList();
		}
	} else {
		renderChatList();
	}
	// Восстанавливаем черновик для выбранного чата
	loadDrafts();
	messageInput.value = chatDrafts[id] || '';
}

messageForm.addEventListener('submit', async function(e) {
	e.preventDefault();
	if (window.isSendingMessage) return;
	window.isSendingMessage = true;
	const sendBtn = document.getElementById('send-btn');
	if (sendBtn) sendBtn.disabled = true;
	messageInput.disabled = true;
	try {
		const text = messageInput.value.trim();
		if ((!text && attachedFiles.length === 0) || !currentChatId) {
			window.isSendingMessage = false;
			if (sendBtn) sendBtn.disabled = false;
			messageInput.disabled = false;
			return;
		}
		const user = getUser();
		// Если есть файлы — отправляем через FormData
		if (attachedFiles.length > 0) {
			const formData = new FormData();
			formData.append('chat_id', currentChatId);
			formData.append('user_id', user.id);
			formData.append('content', text);
			if (replyToMsg) formData.append('reply_to', replyToMsg.id);
			attachedFiles.forEach(f => formData.append('files', f));
			await fetch('/api/messenger/send_file', {
				method: 'POST',
				body: formData
			});
			attachedFiles = [];
			renderAttachPreview();
			messageFileInput.value = '';
		} else {
			await fetch('/api/messenger/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chat_id: currentChatId, user_id: user.id, content: text, reply_to: replyToMsg ? replyToMsg.id : null })
			});
		}
		clearReplyTo();
		// Очищаем черновик для текущего чата
		chatDrafts[currentChatId] = '';
		saveDrafts();
		messageInput.value = '';
		await fetchMessages(currentChatId);
	} finally {
		window.isSendingMessage = false;
		if (sendBtn) sendBtn.disabled = false;
		messageInput.disabled = false;
	}
});
// --- Автосохранение черновика при вводе ---
if (messageInput) {
	messageInput.addEventListener('input', function() {
		if (currentChatId !== null) {
			chatDrafts[currentChatId] = messageInput.value;
			saveDrafts();
		}
	});
}

// --- Открытие чата по hash и восстановление последнего чата ---
window.addEventListener('DOMContentLoaded', function() {
	let chatIdFromHash = null;
	if (location.hash && location.hash.startsWith('#chat-')) {
		chatIdFromHash = parseInt(location.hash.replace('#chat-', ''));
	}
	let chatIdFromStorage = null;
	try {
		const last = localStorage.getItem('messenger_lastChat');
		if (last) chatIdFromStorage = parseInt(last);
	} catch(e) {}

	const origFetchChats = fetchChats;
	fetchChats = async function() {
		await origFetchChats();
		let chatSocket = null;
		let wsReconnectTimeout = null;
		function connectChatWebSocket(chatId) {
			// Если уже есть соединение — корректно закрываем и ждем onclose
			if (chatSocket) {
				chatSocket.onclose = function() {
					// Открываем новое соединение только после полного закрытия старого
					wsReconnectTimeout = setTimeout(() => {
						openNewWebSocket(chatId);
					}, 120); // небольшая задержка
				};
				chatSocket.close();
				chatSocket = null;
			} else {
				openNewWebSocket(chatId);
			}
		}

		function openNewWebSocket(chatId) {
			let wsPort = location.port ? location.port : '8080';
			let wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.hostname + ':' + wsPort + `/ws/chat/${chatId}`;
			chatSocket = new WebSocket(wsUrl);
			chatSocket.onmessage = function(event) {
				try {
					const data = JSON.parse(event.data);
					if (data.type === 'new_message' && data.message) {
						if (String(currentChatId) === String(chatId)) {
							currentMessages.push(data.message);
							renderMessages();
						}
					}
				} catch(e) {}
			};
			chatSocket.onclose = function() {
				setTimeout(() => {
					if (String(currentChatId) === String(chatId)) {
						connectChatWebSocket(chatId);
					}
				}, 2000);
			};
		};
	}

});

// --- Глобальный WebSocket для мессенджера ---
let globalSocket = null;

function connectGlobalWebSocket() {
    if (globalSocket) {
        if (globalSocket.readyState === WebSocket.OPEN || globalSocket.readyState === WebSocket.CONNECTING) {
            console.log('Global WebSocket is already open or connecting.');
            return;
        }
        globalSocket.onclose = null;
        globalSocket.close();
    }

    let wsPort = location.port ? location.port : '8080';
    let wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.hostname + ':' + wsPort + '/ws/messenger';
    globalSocket = new WebSocket(wsUrl);

    globalSocket.onopen = function() {
        console.log('Global WebSocket connection established');
    };

    globalSocket.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'new_message' && data.message) {
                showNotification(data.chat_id, data.message);
            }
        } catch (e) {
            console.error('Error processing global WebSocket message:', e);
        }
    };

    globalSocket.onclose = function(event) {
        console.warn('Global WebSocket connection closed:', event);
        setTimeout(connectGlobalWebSocket, 5000); // Повторное подключение через 5 секунд
    };

    globalSocket.onerror = function(error) {
        console.error('Global WebSocket error:', error);
    };
}

function showNotification(chatId, message) {
    const notification = document.createElement('div');
    notification.className = 'chat-notification';
    notification.innerHTML = `
        <strong>Чат #${chatId}</strong><br>
        <span>${escapeHtml(message.sender_name)}: ${escapeHtml(message.content)}</span>
    `;
		document.body.appendChild(notification);
		notification.innerHTML += `
			<div style="font-size:0.9em;color:#888;margin-top:2px;">${formatMessageTime(message.created_at)}</div>
		`;

    setTimeout(() => {
        notification.remove();
    }, 5000); // Уведомление исчезает через 5 секунд
}

// Подключение глобального WebSocket при загрузке страницы
window.addEventListener('DOMContentLoaded', function() {
	connectGlobalWebSocket();
	// Запись активности пользователя (вход в мессенджер)
	const user = getUser && getUser();
	if (user && user.id) {
		fetch('/api/messenger/visit', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ user_id: user.id })
		});
	}
});

// Пример создания приватного чата (вызывайте при выборе пользователя)
async function createPrivateChatWith(user2id) {
	const user = getUser();
	if (!user || user.id === user2id) return;
	const res = await fetch('/api/messenger/create_private', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ user1_id: user.id, user2_id: user2id })
	});
	const data = await res.json();
	await fetchChats();
	selectChat(data.chat_id);
}

// Функция для обработки времени сообщений
function formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    if (isNaN(date)) return 'Invalid date';
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// Обновление логики уведомлений
function handleIncomingMessage(message) {
    if (message.chat_id === currentChatId || message.sender_id === currentUser.id) {
        // Игнорируем уведомления от текущего чата или от самого себя
        return;
    }

    // Отображение уведомления
    showNotification(message.content, formatMessageTime(message.created_at));
}

// Инициализация чатов только после получения пользователя
window.addEventListener('user-session-changed', function() {
	if (window.user) {
		fetchChats();
	}
});
