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


rl.question('\nEnter your username: ', (ans) => {
    const enteredName = ans.trim();
    if (!enteredName) {
        console.log("Username cannot be empty.");
        process.exit(1);
    }
    registerOrLogin(enteredName);
});

async function registerOrLogin(name) {
    try {
        loadOrGenerateKeys(name);

        console.log("[uploading key]");

        const response = await fetch(`${USER_API}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: name,
                publicKey: myPublicKey
            })
        });

        const userData = await response.json();
        username = userData.username;

        if (response.status === 201) {
            console.log(`\n${username} registered`);
        } else {
            console.log(`\nWelcome back, ${username}`);
        }

        showMainMenu();

    } catch (err) {
        console.error('could not connect to server', err);
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


async function createRoom(roomId) {
    try {
        const response = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: roomId
        });

        if (response.status === 201 || response.status === 200) {
            console.log(`\nRoom '${roomId}' created`);
            connectToChat(roomId);
        } else {
            console.log(`\nRoom already exists`);
            showMainMenu();
        }
    } catch (err) {
        console.error('Server communication error', err);
        showMainMenu();
    }
}


async function joinRoom(roomId) {
    try {
        // 1. Verify the room exists
        const response = await fetch(`${API_BASE}/${roomId}`);

        if (response.status === 200) {
            console.log(`\nRoom '${roomId}' found`);


            const historyResponse = await fetch(`${API_BASE}/${roomId}/messages`);

            if (historyResponse.status === 200) {
                const history = await historyResponse.json();

                if (history.length === 0) {
                    console.log(" (No previous messages in this room)");
                } else {
                    let readableCount = 0;

                    history.forEach(msg => {
                        const displayName = (msg.sender === username) ? "You" : msg.sender;

                        if (msg.encryptedContents && msg.encryptedContents[username]) {
                            const plaintext = decryptMyMessage(msg.encryptedContents[username]);
                            console.log(`[${displayName}]: ${plaintext}`);
                            readableCount++;
                        }
                    });

                }
            }

            connectToChat(roomId);
        } else {
            console.log(`\nRoom '${roomId}' does not exist.`);
            showMainMenu();
        }
    } catch (err) {
        console.error('error communicating with the server.', err);
        showMainMenu();
    }
}


function connectToChat(roomId) {
    currentRoom = roomId;

    if (!stompClient) {
        stompClient = new Client({
            brokerURL: WS_URL,
            onConnect: () => setupRoomSubscription(roomId),
            onStompError: (frame) => console.error(frame.body)
        });
        stompClient.activate();
    } else {
        setupRoomSubscription(roomId);
    }
}

async function setupRoomSubscription(roomId) {
    console.log(`\n[logged into Room [${roomId}]]`);
    // console.log("Downloading public keys for E2EE...");

    try {
        const usersResponse = await fetch(USER_API);
        const users = await usersResponse.json();
        users.forEach(u => {
            if (u.publicKey) publicDirectory[u.username] = u.publicKey;
        });
        // console.log(`Loaded ${Object.keys(publicDirectory).length} public keys.`);
    } catch (e) {
        console.log("Failed to load keys");
    }

    roomSubscription = stompClient.subscribe(`/topic/room/${roomId}`, (message) => {
        const data = JSON.parse(message.body);

        if (data.sender !== username) {
            process.stdout.clearLine();
            process.stdout.cursorTo(0);

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

async function handleChatInput(line) {
    const text = line.trim();
    if (text === '/leave') {
        if (roomSubscription) roomSubscription.unsubscribe();
        currentRoom = null;
        rl.removeAllListeners('line');
        showMainMenu();
    } else if (text) {

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

        }

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

    const keysDir = './keys';
    if (!fs.existsSync(keysDir)) {
        fs.mkdirSync(keysDir, { recursive: true });
    }
    const keyFileName = `${keysDir}/${name}_keys.json`;

    if (fs.existsSync(keyFileName)) {
        const keyData = JSON.parse(fs.readFileSync(keyFileName, 'utf8'));
        myPublicKey = keyData.publicKey;
        myPrivateKey = keyData.privateKey;
    } else {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        myPublicKey = publicKey;
        myPrivateKey = privateKey;

        fs.writeFileSync(keyFileName, JSON.stringify({ publicKey, privateKey }));
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
