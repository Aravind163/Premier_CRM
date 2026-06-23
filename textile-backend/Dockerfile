FROM php:8.2-cli

# Base build tools + libraries needed by pdo_mysql, zip, and the SQL Server driver
RUN apt-get update && apt-get install -y \
    git unzip libpq-dev libzip-dev gnupg2 curl apt-transport-https \
    && docker-php-ext-install pdo pdo_mysql zip

# --- Microsoft ODBC Driver + SQL Server PHP extensions (sqlsrv / pdo_sqlsrv) ---
# php:8.2-cli is based on Debian 12 (Bookworm), so we use the debian/12 package feed.
RUN curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && curl https://packages.microsoft.com/config/debian/12/prod.list > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql18 unixodbc-dev \
    && pecl install sqlsrv pdo_sqlsrv \
    && docker-php-ext-enable sqlsrv pdo_sqlsrv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
COPY . .

RUN composer install --no-dev --optimize-autoloader

EXPOSE 10000
CMD php artisan serve --host=0.0.0.0 --port=10000