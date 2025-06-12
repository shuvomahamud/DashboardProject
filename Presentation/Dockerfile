# ---------- build stage ----------
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY ["Presentation/Presentation.csproj", "Presentation/"]
RUN dotnet restore "Presentation/Presentation.csproj"

COPY . .
WORKDIR /src/Presentation
RUN dotnet publish -c Release -o /app /p:UseAppHost=false

# ---------- runtime stage ----------
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app ./

# The UI needs to know where the API lives; Render will inject API_BASE_URL
ENV ASPNETCORE_URLS=http://+:${PORT:-8080}
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ApiBaseUrl=${API_BASE_URL:-https://dashboard-api.onrender.com/}

EXPOSE 8080
ENTRYPOINT ["dotnet", "Presentation.dll"]
