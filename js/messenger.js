
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
	if (document.getElementById('account-menu')) return;
	const user = getUser();
	if (!user) return;
	const menu = document.createElement('div');
	menu.id = 'account-menu';
	menu.className = 'tg-account-menu';
	menu.innerHTML = `
		<button class="account-menu-btn" onclick="window.location.href='account.html'">Аккаунт</button>
		<button class="account-menu-btn">Настройки</button>
		<button class="account-menu-btn">Выйти</button>
	`;
	document.body.appendChild(menu);
	// Позиционирование
	const rect = accountBar.getBoundingClientRect();
	menu.style.position = 'fixed';
	menu.style.left = rect.left + 'px';
	menu.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
	menu.style.zIndex = 1000;
	// Закрытие по клику вне
	setTimeout(() => {
		document.addEventListener('mousedown', hideAccountMenu, { once: true });
	}, 0);
}

function hideAccountMenu() {
	const menu = document.getElementById('account-menu');
	if (menu) menu.remove();
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
