package com.substring.chat.entities;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor

public class Message {

    private String sender;
    private String content;
    private LocalDateTime TimeStamp;

    public Message(String sender, String content) {
        this.sender = sender;
        this.content = content;
        this.TimeStamp = LocalDateTime.now();
    }
}
