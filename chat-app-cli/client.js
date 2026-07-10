const { Client } = require('@stomp/stompjs');
const WebSocket = require('ws');
const readline = require('readline');

// Polyfill WebSocket for Node.js (since it normally only exists in browsers)
Object.assign(global, { WebSocket });

// Setup terminal input/output
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'You: '
});

// Create the STOMP client
const stompClient = new Client({
    // Because you used .withSockJS() in Java, we append /websocket to the URL
    brokerURL: 'ws://localhost:8080/chat/websocket',

    onConnect: () => {
        console.log('\n✅ Connected to Spring Boot Server!');

        // Subscribe to a public topic (adjust this to match your Spring Controller!)
        stompClient.subscribe('/topic/messages', (message) => {
            // Clear the current prompt line, print the message, and reset prompt
            process.stdout.clearLine();
            process.stdout.cursorTo(0);
            console.log(`\n📩 Server says: ${message.body}`);
            rl.prompt();
        });

        rl.prompt();
    },

    onStompError: (frame) => {
        console.error('Broker reported error: ' + frame.headers['message']);
        console.error('Additional details: ' + frame.body);
    },

    onWebSocketClose: () => {
        console.log('\n❌ Disconnected from server.');
        process.exit(0);
    }
});

// When you type in the terminal and hit Enter...
rl.on('line', (line) => {
    const text = line.trim();
    if (text === '/quit') {
        stompClient.deactivate();
    } else if (text) {
        // Send the message to your Spring Boot backend
        // (Adjust the destination to match your @MessageMapping in Java)
        stompClient.publish({
            destination: '/app/chat',
            body: JSON.stringify({ content: text })
        });
    }
    rl.prompt();
});

console.log('Connecting to server...');
stompClient.activate();