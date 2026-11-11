package com.plataforma.comunicacion.config;

import com.plataforma.comunicacion.security.TurnstileAuthenticationFilter;
import com.plataforma.comunicacion.service.TurnstileService;

import org.springframework.boot.context.properties.EnableConfigurationProperties;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CsrfFilter;

@Configuration
@EnableConfigurationProperties(TurnstileConfig.class)
public class SecurityConfig {

    private final TurnstileService turnstileService;

    public SecurityConfig(TurnstileService turnstileService) {
        this.turnstileService = turnstileService;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http) throws Exception {

        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    "/",
                    "/login",
                    "/registro",
                    "/cuenta/verificar",
                    "/cuenta/recuperar",
                    "/cuenta/restablecer",
                    "/css/**",
                    "/js/**",
                    "/images/**",
                    "/favicon.ico",
                    "/error"
                ).permitAll()
                .anyRequest().authenticated()
            )

            .formLogin(form -> form
                .loginPage("/login")
                .loginProcessingUrl("/login")
                .usernameParameter("email")
                .passwordParameter("password")
                .defaultSuccessUrl("/mensajes", true)
                .failureUrl("/login?error")
                .permitAll()
            )

            .logout(logout -> logout
                .logoutUrl("/logout")
                .logoutSuccessUrl("/login?logout")
                .invalidateHttpSession(true)
                .clearAuthentication(true)
                .deleteCookies("JSESSIONID")
                .permitAll()
            );

        // Protección anti-bot.
        // Se ejecuta después de la protección CSRF
        // y antes del filtro de autenticación.
        http.addFilterAfter(
                new TurnstileAuthenticationFilter(turnstileService),
                CsrfFilter.class
        );

        // Conservamos la protección CSRF de Spring Security.
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}