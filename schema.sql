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
