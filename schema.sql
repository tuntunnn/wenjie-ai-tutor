CREATE DATABASE IF NOT EXISTS wenjie CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS wenjie.learning_turns (
 conversation_id CHAR(36) CHARACTER SET ascii NOT NULL,
 turn_number INT UNSIGNED NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 problem TEXT NOT NULL,
 student_text TEXT NOT NULL,
 tutor_text TEXT NOT NULL,
 completed BOOLEAN NOT NULL,
 mode VARCHAR(64) NOT NULL,
 PRIMARY KEY (conversation_id,turn_number),
 INDEX recent_turns (created_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4;

CREATE TABLE IF NOT EXISTS wenjie.accounts (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 username VARCHAR(32) NOT NULL UNIQUE,
 salt BINARY(16) NOT NULL,
 password_hash BINARY(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS wenjie.account_sessions (
 token_hash BINARY(32) PRIMARY KEY,
 account_id INT UNSIGNED NOT NULL,
 expires_at DATETIME NOT NULL,
 FOREIGN KEY (account_id) REFERENCES wenjie.accounts(id) ON DELETE CASCADE,
 INDEX (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wenjie.conversations (
 id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
 account_id INT UNSIGNED NULL,
 FOREIGN KEY (account_id) REFERENCES wenjie.accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;
