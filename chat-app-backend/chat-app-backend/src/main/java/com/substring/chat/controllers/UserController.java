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

    @PostMapping("/login")
    public ResponseEntity<?> loginOrCreate(@RequestBody UserLoginRequest request) {
        String cleanUsername = request.getUsername().trim();

        User existingUser = userRepository.findByUsername(cleanUsername);

        if (existingUser != null) {
            if(!existingUser.getPassword().equals(request.getPassword())) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Incorrect password");
            }

            existingUser.setPublicKey(request.getPublicKey());
            userRepository.save(existingUser);
            return ResponseEntity.ok(existingUser);
        }

        User newUser = new User(cleanUsername, request.getPublicKey());
        newUser.setPassword(request.getPassword());
        userRepository.save(newUser);

        return ResponseEntity.status(HttpStatus.CREATED).body(newUser);
    }

    @GetMapping
    public ResponseEntity<List<User>> getAllUsers() {
        return ResponseEntity.ok(userRepository.findAll());
    }
}