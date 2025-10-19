// --- Прикрепление файлов к сообщению ---
const attachBtn = document.getElementById('attach-btn');
const messageFileInput = document.getElementById('message-file');
const messageFormEl = document.getElementById('message-form');
let attachedFiles = [];

// Элемент для предпросмотра
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
		// Картинка
		if (file.type.startsWith('image/')) {
			const img = document.createElement('img');
			img.className = 'attach-preview-img';
			img.src = URL.createObjectURL(file);
			item.appendChild(img);
		}
		// Имя файла
		const fname = document.createElement('div');
		fname.className = 'attach-preview-filename';
		fname.textContent = file.name;
		item.appendChild(fname);
		// Кнопка удаления
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
// --- Кнопка редактирования чата ---
const chatEditBtn = document.getElementById('chat-edit-btn');
// --- Модальное окно редактирования чата ---
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
	// Заполнить текущие данные
	const chat = chats.find(c => c.id === chatId);
	if (!chat) return;
	chatEditModal.style.display = 'flex';
	editChatTitleInput.value = chat.title || '';
	// Получить текущих участников
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
			// Проверить существование пользователя
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
		// Получить id пользователей по username
		const res = await fetch('/api/users');
		const data = await res.json();
		const users = data.users || [];
		const userIds = editChatUsers.map(username => {
			const u = users.find(u => u.username === username);
			return u ? u.id : null;
		}).filter(Boolean);
		// Отправить изменения на сервер
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
// --- Кнопка редактирования чата ---
// (объявление и обработчик уже есть выше)
// --- Модальное окно участников чата ---
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

// --- Черновики сообщений по чатам ---
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

	// --- Установка reply на сообщение ---
	function setReplyTo(msg) {
		replyToMsg = msg;
		var replyPreview = document.getElementById('reply-preview');
		if (!replyPreview) return;
		replyPreview.style.display = 'block';
		var text = '<b>Ответ на:</b> <span style="color:#229ed9">' + escapeHtml(msg.sender_name) + '</span> ';
		if (msg.content) text += escapeHtml(msg.content.slice(0, 80));
		if (msg.files && Array.isArray(msg.files) && msg.files.length) text += ' [файл]';
		replyPreview.innerHTML = text + '<button style="margin-left:10px;background:none;border:none;color:#e74c3c;font-size:1em;cursor:pointer;" onclick="clearReplyTo()">×</button>';
	}
	`;
	accountBar.onclick = showAccountMenu;
}

function showAccountMenu(e) {
	e.stopPropagation();
	const oldMenu = document.getElementById('account-menu');
	if (oldMenu) {
		// Если уже открыто — закрыть с анимацией
		hideAccountMenuAnimated();
		return;
	}
	const user = getUser();
	if (!user) return;
	const menu = document.createElement('div');
	menu.id = 'account-menu';
	menu.className = 'tg-account-menu';
	// Кнопки (от нижней к верхней)
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
	// Позиционирование
	const rect = accountBar.getBoundingClientRect();
	menu.style.position = 'fixed';
	menu.style.left = rect.left + 'px';
	menu.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
	menu.style.zIndex = 1000;
	// Анимация появления (снизу вверх)
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
	// Закрытие по клику вне
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
	// Для каждого чата получаем последнее сообщение
	chats = await Promise.all(rawChats.map(async chat => {
		let lastMsg = null;
		try {
			const msgRes = await fetch(`/api/messenger/messages?chat_id=${chat.id}&user_id=${user.id}&is_admin=${isAdmin}`);
			const msgs = await msgRes.json();
			if (msgs.length) {
				const m = msgs[msgs.length - 1];
				lastMsg = {
					text: m.content,
					sender: m.sender_name,
					date: m.created_at
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
}
// Диалог создания нового чата
if (newChatBtn) {
	newChatBtn.onclick = async function() {
		const username = prompt('Введите имя пользователя для приватного чата:');
		if (!username) return;
		// Получить id пользователя по имени
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
	chats.forEach(chat => {
		const li = document.createElement('li');
		li.className = chat.id === currentChatId ? 'active' : '';
		li.onclick = () => selectChat(chat.id);
		// Заголовок чата
		const titleDiv = document.createElement('div');
		titleDiv.textContent = chat.title || `Чат #${chat.id}`;
		titleDiv.style.fontWeight = 'bold';
		li.appendChild(titleDiv);
		// Превью последнего сообщения
		if (chat.lastMsg) {
			const msgDiv = document.createElement('div');
			msgDiv.className = 'chat-last-msg';
			msgDiv.style.fontSize = '0.62em';
			msgDiv.style.color = '#bfc9d8';
			msgDiv.style.marginTop = '2px';
			let preview = chat.lastMsg.text;
			if (preview.length > 36) preview = preview.slice(0, 36) + '…';
			msgDiv.textContent = `${chat.lastMsg.sender}: ${preview}`;
			li.appendChild(msgDiv);
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
		// Ищем [files] ...
		const filesMatch = content.match(/\[files\](.*)$/s);
		if (filesMatch) {
			// Получаем список файлов
			const filesStr = filesMatch[1].trim();
			files = filesStr.split(/,\s*/).filter(Boolean);
			content = content.replace(/\n?\[files\].*$/s, '').trim();
		}
		// Формируем HTML для файлов
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
		// --- reply preview (если это ответ) ---
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
				replyDiv.innerHTML = `<span style=\"font-weight:500;\">${escapeHtml(repliedMsg.sender_name)}:</span> ${escapeHtml(repliedMsg.content).slice(0, 48)}${repliedMsg.content.length > 48 ? '…' : ''}`;
				div.appendChild(replyDiv);
			}
		}
		// --- Время отправки ---
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
		// --- Надпись времени ---
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
		// --- Кнопки управления (удалить/ответить) ---
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
			// Кнопка удалить
			if (msg.sender_id === user.id || user.role === 'admin') {
				const delBtn = document.createElement('button');
				delBtn.textContent = '✖';
				delBtn.className = 'msg-del-btn';
				delBtn.onclick = (ev) => { ev.stopPropagation(); deleteMessage(msg.id); controlsDiv.remove(); };
				controlsDiv.appendChild(delBtn);
			}
			// Кнопка ответить
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
	renderChatList();
	// Восстанавливаем черновик для выбранного чата
	loadDrafts();
	messageInput.value = chatDrafts[id] || '';
}

messageForm.addEventListener('submit', async function(e) {
	e.preventDefault();
	const text = messageInput.value.trim();
	if ((!text && attachedFiles.length === 0) || !currentChatId) return;
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
		let toOpen = null;
		// Если есть hash — всегда открываем по нему
		if (chatIdFromHash && chats.some(c => c.id === chatIdFromHash)) {
			toOpen = chatIdFromHash;
		} else if (chatIdFromStorage && chats.some(c => c.id === chatIdFromStorage)) {
			toOpen = chatIdFromStorage;
		}
		if (toOpen) selectChat(toOpen);
	};
});
});

async function deleteMessage(msgId) {
	const user = getUser();
	if (!user) return;
	await fetch('/api/messenger/delete_message', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ msg_id: msgId, user_id: user.id })
	});
	await fetchMessages(currentChatId);
}

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

// Инициализация
fetchChats();
