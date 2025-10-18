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
	chats = await res.json();
	renderChatList();
	renderAccountBar();
	if (chats.length && !currentChatId) selectChat(chats[0].id);
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
		li.textContent = chat.title || `Чат #${chat.id}`;
		li.className = chat.id === currentChatId ? 'active' : '';
		li.onclick = () => selectChat(chat.id);
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
		div.innerHTML = `<b>${msg.sender_name}:</b> ${escapeHtml(msg.content)}`;
		// Кнопка удаления
		if (msg.sender_id === user.id || user.role === 'admin') {
			const delBtn = document.createElement('button');
			delBtn.textContent = '✖';
			delBtn.className = 'msg-del-btn';
			delBtn.onclick = (e) => { e.stopPropagation(); deleteMessage(msg.id); };
			div.appendChild(delBtn);
		}
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
	currentChatId = id;
	const chat = chats.find(c => c.id === id);
	currentChatTitle = chat ? (chat.title || `Чат #${chat.id}`) : '';
	chatTitle.textContent = currentChatTitle;
	await fetchMessages(id);
	renderChatList();
}

messageForm.addEventListener('submit', async function(e) {
	e.preventDefault();
	const text = messageInput.value.trim();
	if (!text || !currentChatId) return;
	const user = getUser();
	await fetch('/api/messenger/send', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ chat_id: currentChatId, user_id: user.id, content: text })
	});
	messageInput.value = '';
	await fetchMessages(currentChatId);
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
