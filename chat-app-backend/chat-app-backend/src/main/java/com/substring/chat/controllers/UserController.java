package com.substring.chat.controllers;

import com.substring.chat.entities.User;
import com.substring.chat.payload.UserLoginRequest;
import com.substring.chat.repositories.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/users")
@CrossOrigin("*")
public class UserController {

    private UserRepository userRepository;

    public UserController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    // 1. Used when a user logs in via the CLI
    @PostMapping("/login")
    public ResponseEntity<?> loginOrCreate(@RequestBody UserLoginRequest request) {
        String cleanUsername = request.getUsername().trim();

        User existingUser = userRepository.findByUsername(cleanUsername);

        if (existingUser != null) {
            // Update the public key because the Node.js CLI generates a brand new one every time it runs!
            existingUser.setPublicKey(request.getPublicKey());
            userRepository.save(existingUser);
            return ResponseEntity.ok(existingUser);
        }

        // Create a brand new user account with their public key
        User newUser = new User(cleanUsername, request.getPublicKey());
        userRepository.save(newUser);

        return ResponseEntity.status(HttpStatus.CREATED).body(newUser);
    }

    // 2. Used to download the public keys of everyone in the chat
    @GetMapping
    public ResponseEntity<List<User>> getAllUsers() {
        return ResponseEntity.ok(userRepository.findAll());
    }
}