const { Client } = require('@stomp/stompjs');
const WebSocket = require('ws');
const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');

Object.assign(global, { WebSocket });

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const API_BASE = 'http://localhost:8080/api/v1/rooms';
const WS_URL = 'ws://localhost:8080/chat/websocket';
const USER_API = 'http://localhost:8080/api/v1/users';

let username = '';
let currentRoom = null;
let stompClient = null;
let roomSubscription = null;
let myPublicKey = '';
let myPrivateKey = '';
let publicDirectory = {};

// --- INITIALIZATION ---
rl.question('\nWelcome to the Terminal Chat! Enter your username: ', (ans) => {
    const enteredName = ans.trim();
    if (!enteredName) {
        console.log("❌ Username cannot be empty.");
        process.exit(1);
    }
    registerOrLogin(enteredName);
});

// --- NEW AUTHENTICATION & KEY EXCHANGE FUNCTION ---
async function registerOrLogin(name) {
    try {
        // 1. Generate the fresh E2EE key pair locally
        loadOrGenerateKeys(name);

        console.log("📡 Connecting to server and uploading Public Key...");

        // 2. Post the username and padlock to the new UserController
        const response = await fetch(`${USER_API}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: name,
                publicKey: myPublicKey
            })
        });

        const userData = await response.json();
        username = userData.username; // Lock in the official username from MongoDB

        if (response.status === 201) {
            console.log(`\n🎉 New encrypted account created for: ${username}`);
        } else {
            console.log(`\n✅ Welcome back, ${username}!`);
        }

        // 3. Kick off the main lobby menu
        showMainMenu();

    } catch (err) {
        console.error('❌ Could not connect to authentication server. Is Spring Boot running?', err);
        process.exit(1);
    }
}

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
                    let readableCount = 0; // Keep track of messages we can actually read

                    history.forEach(msg => {
                        const displayName = (msg.sender === username) ? "You" : msg.sender;

                        // Only process and print the message if we have a lock for it
                        if (msg.encryptedContents && msg.encryptedContents[username]) {
                            const plaintext = decryptMyMessage(msg.encryptedContents[username]);
                            console.log(`[${displayName}]: ${plaintext}`);
                            readableCount++;
                        }
                        // Notice we completely removed the "else" block!
                        // Unreadable messages are now silently ignored.
                    });

                    // If they are a first-time joiner, they won't have read anything
                    if (readableCount === 0) {
                        console.log(" (No readable history for new participants)");
                    }
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

async function setupRoomSubscription(roomId) {
    console.log(`\n--- You are now in Room [${roomId}] ---`);
    console.log("Downloading public keys for E2EE...");

    // Fetch the directory
    try {
        const usersResponse = await fetch(USER_API);
        const users = await usersResponse.json();
        users.forEach(u => {
            if (u.publicKey) publicDirectory[u.username] = u.publicKey;
        });
        console.log(`✅ Loaded ${Object.keys(publicDirectory).length} public keys.`);
    } catch (e) {
        console.log("Failed to load keys. Chat may not work.");
    }

    roomSubscription = stompClient.subscribe(`/topic/room/${roomId}`, (message) => {
        const data = JSON.parse(message.body);

        if (data.sender !== username) {
            process.stdout.clearLine();
            process.stdout.cursorTo(0);

            // Look for our specific lock in the dictionary
            const myEncryptedText = data.encryptedContents ? data.encryptedContents[username] : null;

            if (myEncryptedText) {
                const plaintext = decryptMyMessage(myEncryptedText);
                console.log(`\n[${data.sender}]: ${plaintext}`);
            } else {
                console.log(`\n[${data.sender}]: [Message not encrypted for you]`);
            }
            rl.prompt();
        }
    });

    rl.removeAllListeners('line');
    rl.on('line', handleChatInput);
    rl.setPrompt(`${username}: `);
    rl.prompt();
}

// Add 'async' to the function definition
async function handleChatInput(line) {
    const text = line.trim();
    if (text === '/leave') {
        if (roomSubscription) roomSubscription.unsubscribe();
        currentRoom = null;
        rl.removeAllListeners('line');
        showMainMenu();
    } else if (text) {

        // --- NEW: QUICK DIRECTORY REFRESH ---
        // Always grab the latest keys right before sending so we don't miss new users
        try {
            const usersResponse = await fetch(USER_API);
            if (usersResponse.ok) {
                const users = await usersResponse.json();
                users.forEach(u => {
                    if (u.publicKey && u.username) {
                        publicDirectory[u.username] = u.publicKey;
                    }
                });
            }
        } catch (e) {
            // Silently fail and use the cached directory if the server hiccups
        }
        // ------------------------------------

        // Scramble the message for everyone in the refreshed directory
        const encryptedPackage = encryptMessageForEveryone(text);

        stompClient.publish({
            destination: `/app/sendMessage/${currentRoom}`,
            body: JSON.stringify({
                sender: username,
                encryptedContents: encryptedPackage
            })
        });
        rl.prompt();
    } else {
        rl.prompt();
    }
}

function loadOrGenerateKeys(name) {
    // 1. Define the dedicated folder path
    const keysDir = './keys';

    // 2. Create the folder automatically if it doesn't exist
    if (!fs.existsSync(keysDir)) {
        fs.mkdirSync(keysDir, { recursive: true });
    }

    // 3. Route the key file inside the new folder
    const keyFileName = `${keysDir}/${name}_keys.json`;

    if (fs.existsSync(keyFileName)) {
        // If the file exists, load the saved keys from the hard drive
        console.log(`\n🔑 Found saved keys for ${name}. Loading from disk...`);
        const keyData = JSON.parse(fs.readFileSync(keyFileName, 'utf8'));
        myPublicKey = keyData.publicKey;
        myPrivateKey = keyData.privateKey;
    } else {
        // If no file exists, generate new keys and save them
        console.log('\n🔒 Generating your fresh E2EE key pair...');
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        myPublicKey = publicKey;
        myPrivateKey = privateKey;

        // Save the keys locally into the keys folder
        fs.writeFileSync(keyFileName, JSON.stringify({ publicKey, privateKey }));
        console.log(`💾 Keys securely saved to disk at ${keyFileName}`);
    }
}
function encryptMessageForEveryone(plaintext) {
    const encryptedMap = {};
    for (const [targetUser, targetPubKey] of Object.entries(publicDirectory)) {
        try {
            const encryptedBuffer = crypto.publicEncrypt(
                targetPubKey,
                Buffer.from(plaintext, 'utf8')
            );
            encryptedMap[targetUser] = encryptedBuffer.toString('base64');
        } catch (err) {
            // Skip invalid keys quietly
        }
    }
    return encryptedMap;
}

function decryptMyMessage(encryptedBase64) {
    try {
        const decryptedBuffer = crypto.privateDecrypt(
            myPrivateKey,
            Buffer.from(encryptedBase64, 'base64')
        );
        return decryptedBuffer.toString('utf8');
    } catch (err) {
        return "[Decryption Failed]";
    }
}
