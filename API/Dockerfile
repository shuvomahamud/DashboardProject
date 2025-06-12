# ---------- build stage ----------
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# copy csproj + restore early (better cache)
COPY ["API/API.csproj", "API/"]
RUN dotnet restore "API/API.csproj"

# copy the rest & publish
COPY . .
WORKDIR /src/API
RUN dotnet publish -c Release -o /app /p:UseAppHost=false

# ---------- runtime stage ----------
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app ./

# Render (and many other hosts) look for PORT env var
ENV ASPNETCORE_URLS=http://+:${PORT:-8080}

# Optional: tell .NET we are in production
ENV ASPNETCORE_ENVIRONMENT=Production

EXPOSE 8080
ENTRYPOINT ["dotnet", "API.dll"]
