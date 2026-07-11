const { Client } = require('@stomp/stompjs');
const WebSocket = require('ws');
const readline = require('readline');

Object.assign(global, { WebSocket });

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const API_BASE = 'http://localhost:8080/api/v1/rooms';
const WS_URL = 'ws://localhost:8080/chat/websocket';

let username = '';
let currentRoom = null;
let stompClient = null;
let roomSubscription = null;
let myPublicKey = '';
let myPrivateKey = '';

// --- INITIALIZATION ---
rl.question('\nEnter your username: ', (ans) => {
    username = ans.trim();
    showMainMenu();
});

// --- THE LOBBY ---
function showMainMenu() {
    console.log(`   LOBBY (Logged in as ${username})`);
    console.log(' ');
    console.log('[1] Create a new room');
    console.log('[2] Join an existing room');
    console.log('[3] Quit');

    rl.question('\nSelect an option (1-3): ', async (choice) => {
        switch (choice.trim()) {
            case '1':
                rl.question('Enter a new Room ID to create: ', createRoom);
                break;
            case '2':
                rl.question('Enter the Room ID to join: ', joinRoom);
                break;
            case '3':
                console.log('Session Terminated');
                process.exit(0);
            default:
                console.log('Invalid choice.');
                showMainMenu();
        }
    });
}

// --- REST API: CREATE ROOM ---
async function createRoom(roomId) {
    try {
        const response = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' }, // Because your Spring controller takes @RequestBody String
            body: roomId
        });

        if (response.status === 201 || response.status === 200) {
            console.log(`\n✅ Room '${roomId}' created successfully!`);
            connectToChat(roomId);
        } else {
            console.log(`\n❌ Failed to create room. It might already exist.`);
            showMainMenu();
        }
    } catch (err) {
        console.error('Network error communicating with the server.', err);
        showMainMenu();
    }
}

// --- REST API: JOIN ROOM & LOAD HISTORY ---
async function joinRoom(roomId) {
    try {
        // 1. Verify the room exists
        const response = await fetch(`${API_BASE}/${roomId}`);

        if (response.status === 200) {
            console.log(`\n✅ Room '${roomId}' found. Loading history...`);

            // 2. Fetch the message history (defaults to the last 20 messages)
            const historyResponse = await fetch(`${API_BASE}/${roomId}/messages`);

            if (historyResponse.status === 200) {
                const history = await historyResponse.json();

                console.log('\nMessage History');
                if (history.length === 0) {
                    console.log(" (No previous messages in this room)");
                } else {
                    // Print out every old message
                    history.forEach(msg => {
                        console.log(`[${msg.sender}]: ${msg.content}`);
                    });
                }
            }

            // 3. Start the live WebSocket connection
            connectToChat(roomId);
        } else {
            console.log(`\n❌ Room '${roomId}' does not exist.`);
            showMainMenu();
        }
    } catch (err) {
        console.error('Network error communicating with the server.', err);
        showMainMenu();
    }
}

// --- WEBSOCKET: CHAT MODE ---
function connectToChat(roomId) {
    currentRoom = roomId;

    if (!stompClient) {
        stompClient = new Client({
            brokerURL: WS_URL,
            onConnect: () => setupRoomSubscription(roomId),
            onStompError: (frame) => console.error('Broker error: ' + frame.body)
        });
        stompClient.activate();
    } else {
        // Re-using the existing connection if we just switched rooms
        setupRoomSubscription(roomId);
    }
}

function setupRoomSubscription(roomId) {
    console.log(`\nYou are now in Room [${roomId}]`);
    console.log(`use /leave to exit)`);

    // Subscribe to the specific room
    roomSubscription = stompClient.subscribe(`/topic/room/${roomId}`, (message) => {
        const data = JSON.parse(message.body);

        // Don't echo our own messages
        if (data.sender !== username) {
            process.stdout.clearLine();
            process.stdout.cursorTo(0);
            console.log(`\n[${data.sender}]: ${data.content}`);
            rl.prompt();
        }
    });

    // Take over the readline input for chat mode
    rl.removeAllListeners('line'); // Remove lobby listeners
    rl.on('line', handleChatInput);

    rl.setPrompt(`${username}: `);
    rl.prompt();
}

function handleChatInput(line) {
    const text = line.trim();

    if (text === '/leave') {
        // Drop the subscription so we stop receiving messages for this room
        if (roomSubscription) roomSubscription.unsubscribe();
        currentRoom = null;

        // Return readline to lobby mode
        rl.removeAllListeners('line');
        showMainMenu();
    } else if (text) {
        // Publish the message to the Spring Controller
        stompClient.publish({
            destination: `/app/sendMessage/${currentRoom}`,
            body: JSON.stringify({ sender: username, content: text })
        });
        rl.prompt();
    } else {
        rl.prompt();
    }
}
