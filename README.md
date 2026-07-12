
# Terminal Chat Application

A secure, terminal-based real-time chat application featuring a Java Spring Boot backend and a Node.js command-line interface. The architecture is designed to be lightweight and strictly prioritizes user privacy through local cryptography.

## Core Features

* **End-to-End Encryption (E2EE):** Messages are secured using RSA-2048 key pairs generated directly on the client machine. The backend only routes encrypted text and cannot read message contents.
* **Secure Authentication:** User passwords are SHA-256 hashed on the client side before reaching the network or database.
* **Real-Time WebSockets:** Live bidirectional communication handled via STOMP over WebSockets.
* **Persistent Local Keys:** Cryptographic keys are safely written to a local `keys/` directory, allowing users to decrypt their historical messages upon returning.
* **Smart History Management:** Historical messages are seamlessly loaded for returning room members, while remaining cryptographically locked and hidden from new participants.

---

## Prerequisites

To run this application locally, you must have the following installed and running:

* **Java:** JDK 17 or higher
* **Node.js:** v18 or higher
* **MongoDB:** Community Server running locally on default port `27017`

---

## Installation & Setup

### 1. Start the Database

Ensure your local MongoDB service is actively running. The backend will automatically create the required `users` and `rooms` collections upon first launch.

### 2. Run the Backend (Java/Spring Boot)

Navigate to the root directory of the Spring Boot project and start the server. By default, it will listen on `localhost:8080`.

```bash
./mvnw spring-boot:run

```

### 3. Run the Client (Node.js)

Open a new terminal window, navigate to the `chat-app-cli` directory, and install the required dependencies:

```bash
npm install ws @stomp/stompjs

```

Launch the client:

```bash
node client.js

```

---

## Usage

1. **Authentication:** Upon running the client, enter a username. If the account is new, you will be prompted to create and verify a password. If returning, simply enter your existing password.
2. **Navigation:** Use the terminal menu to either create a new Room ID or join an existing one.
3. **Chatting:** Type your messages directly into the terminal. All outgoing messages are instantly encrypted against the public directory of current room members.
4. **Exiting:** Type `/leave` to exit a chat room and return to the main menu.
