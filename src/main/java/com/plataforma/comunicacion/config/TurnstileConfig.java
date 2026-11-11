package com.plataforma.comunicacion.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ekko.turnstile")
public class TurnstileConfig {

    private String siteKey;
    private String secretKey;
    private String verifyUrl;
    private String expectedHostname;

    public String getSiteKey() {
        return siteKey;
    }

    public void setSiteKey(String siteKey) {
        this.siteKey = siteKey;
    }

    public String getSecretKey() {
        return secretKey;
    }

    public void setSecretKey(String secretKey) {
        this.secretKey = secretKey;
    }

    public String getVerifyUrl() {
        return verifyUrl;
    }

    public void setVerifyUrl(String verifyUrl) {
        this.verifyUrl = verifyUrl;
    }

    public String getExpectedHostname() {
        return expectedHostname;
    }

    public void setExpectedHostname(String expectedHostname) {
        this.expectedHostname = expectedHostname;
    }
}