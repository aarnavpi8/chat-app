package com.substring.chat.payload;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class UserLoginRequest {

    private String username;
    private String publicKey;
    private String password;

}