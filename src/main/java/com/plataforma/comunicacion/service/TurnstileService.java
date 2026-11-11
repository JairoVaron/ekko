package com.plataforma.comunicacion.service;

import com.plataforma.comunicacion.config.TurnstileConfig;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Map;

@Service
public class TurnstileService {

    private static final Logger log =
            LoggerFactory.getLogger(TurnstileService.class);

    private final TurnstileConfig config;
    private final RestClient restClient;

    public TurnstileService(TurnstileConfig config) {
        this.config = config;
        this.restClient = RestClient.create();
    }

    public boolean verify(String token) {

        if (token == null || token.isBlank()) {
            return false;
        }

        MultiValueMap<String, String> request =
                new LinkedMultiValueMap<>();

        request.add("secret", config.getSecretKey());
        request.add("response", token);

        try {

            Map<String, Object> response = restClient
                    .post()
                    .uri(config.getVerifyUrl())
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(request)
                    .retrieve()
                    .body(new ParameterizedTypeReference<>() {});

            if (response == null
                    || !Boolean.TRUE.equals(response.get("success"))) {
                return false;
            }

            Object hostnameValue = response.get("hostname");
            Object actionValue = response.get("action");

            if (!(hostnameValue instanceof String hostname)
                    || config.getExpectedHostname() == null
                    || !hostname.equalsIgnoreCase(
                            config.getExpectedHostname().trim())) {

                log.warn(
                        "Verificación Turnstile rechazada: hostname incorrecto."
                );

                return false;
            }

            if (!(actionValue instanceof String action)
                    || !"login".equals(action)) {

                log.warn(
                        "Verificación Turnstile rechazada: acción incorrecta."
                );

                return false;
            }

            return true;

        } catch (RestClientException ex) {

            log.error(
                    "No fue posible comunicarse con Cloudflare Turnstile.",
                    ex
            );

            return false;
        }
    }
}