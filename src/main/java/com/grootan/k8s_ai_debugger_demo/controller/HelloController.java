package com.grootan.k8s_ai_debugger_demo.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class HelloController {

    @GetMapping("/hello")
    public Map<String, String > hello(){
        return Map.of(
                "message", "Hello from Kubernetes AI Debugger!");
    }

}
