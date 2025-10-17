# lock-box
Secure data room document sharing application

For local deploymnent, generate auth keys in the `backend/keys/` directory.
```bash
openssl genrsa -out keys/jwt.private.pem 2048
openssl rsa -in keys/jwt.private.pem -pubout -out keys/jwt_public.pem
```