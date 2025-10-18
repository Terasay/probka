// Пример данных чатов и сообщений
const chats = [
	{
		id: 1,
		name: 'Генерал',
		messages: [
			{ text: 'Привет! Это тестовый чат.', out: false },
			{ text: 'Привет! Как дела?', out: true },
		]
	},
	{
		id: 2,
		name: 'Система',
		messages: [
			{ text: 'Добро пожаловать в игру!', out: false }
		]
	}
];

let currentChatId = null;

const chatList = document.getElementById('chat-list');
const messagesBox = document.getElementById('messages');
const chatTitle = document.getElementById('chat-title');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

function renderChatList() {
	chatList.innerHTML = '';
	chats.forEach(chat => {
		const li = document.createElement('li');
		li.textContent = chat.name;
		li.className = chat.id === currentChatId ? 'active' : '';
		li.onclick = () => selectChat(chat.id);
		chatList.appendChild(li);
	});
}

function renderMessages() {
	messagesBox.innerHTML = '';
	if (!currentChatId) return;
	const chat = chats.find(c => c.id === currentChatId);
	chat.messages.forEach(msg => {
		const div = document.createElement('div');
		div.className = 'tg-message' + (msg.out ? ' out' : '');
		div.textContent = msg.text;
		messagesBox.appendChild(div);
	});
	messagesBox.scrollTop = messagesBox.scrollHeight;
}

function selectChat(id) {
	currentChatId = id;
	const chat = chats.find(c => c.id === id);
	chatTitle.textContent = chat.name;
	renderChatList();
	renderMessages();
}

messageForm.addEventListener('submit', function(e) {
	e.preventDefault();
	const text = messageInput.value.trim();
	if (!text || !currentChatId) return;
	const chat = chats.find(c => c.id === currentChatId);
	chat.messages.push({ text, out: true });
	messageInput.value = '';
	renderMessages();
});

// Инициализация
renderChatList();
// По умолчанию выбираем первый чат
if (chats.length) selectChat(chats[0].id);
