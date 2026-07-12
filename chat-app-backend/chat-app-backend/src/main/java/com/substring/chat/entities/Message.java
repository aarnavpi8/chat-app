package com.substring.chat.entities;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor

public class Message {

    private String sender;
    private Map<String, String> encryptedContents;
    private LocalDateTime TimeStamp;

    public Message(String sender, Map<String, String> encryptedContents) {
        this.sender = sender;
        this.encryptedContents = encryptedContents;
        this.TimeStamp = LocalDateTime.now();
    }
}
