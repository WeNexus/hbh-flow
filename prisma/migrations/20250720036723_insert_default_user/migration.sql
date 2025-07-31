insert into "public"."User" ("name", "email", "role", "password")
values ('System', 'flow@honeybeeherb.com',
        'SYSTEM',
        '$argon2id$v=19$m=65536,t=3,p=4$nqkBN+WS9LSALTTvsjP7aw$GrUKimayZYpi6R7oZFZxUiYElb6gNla7IUMo2ObOJYg');

-- Password: hbh-admin-1234