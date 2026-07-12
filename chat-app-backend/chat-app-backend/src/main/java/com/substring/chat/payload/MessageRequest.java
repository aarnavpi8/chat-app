package com.substring.chat.payload;


import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.Map;

@Setter
@Getter
@AllArgsConstructor
@NoArgsConstructor

public class MessageRequest {

    Map<String, String> encryptedContents;
    private String sender;
    private String roomid;

}
