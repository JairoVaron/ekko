package com.plataforma.comunicacion.security;

import com.plataforma.comunicacion.service.TurnstileService;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

public class TurnstileAuthenticationFilter extends OncePerRequestFilter {

    private static final String LOGIN_URL = "/login";
    private static final String TOKEN_PARAMETER = "cf-turnstile-response";

    private final TurnstileService turnstileService;

    public TurnstileAuthenticationFilter(
            TurnstileService turnstileService) {

        this.turnstileService = turnstileService;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {

        return !("POST".equalsIgnoreCase(request.getMethod())
                && LOGIN_URL.equals(request.getServletPath()));
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain)
            throws ServletException, IOException {

        String token = request.getParameter(TOKEN_PARAMETER);

        boolean valid = turnstileService.verify(token);

        if (!valid) {

            response.sendRedirect(
                    request.getContextPath() + "/login?captchaError"
            );

            return;
        }

        // La verificación fue satisfactoria.
        // Continuamos con la autenticación original de Spring Security.
        filterChain.doFilter(request, response);
    }
}