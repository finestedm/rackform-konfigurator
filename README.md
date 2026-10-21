# Rackform — konfigurator regałów paletowych

Statyczny konfigurator do wstępnego planowania regałów paletowych. Działa bez serwera i zapisuje bieżący projekt w pamięci przeglądarki.

## Funkcje

- wymiary palety, liczba poziomów oraz osobne wysokości światła i ładunku na każdym poziomie;
- dobór trawersu dla 1–4 palet w każdej sekcji;
- zestawy 1000 / 1900 / 2700 / 3600 mm (standard) i 1000 / 1900 / 2850 / 3800 mm (NFPA 13);
- dowolna liczba sekcji oraz rzędów pojedynczych i podwójnych;
- cztery rodzaje wypełnienia, ochrona słupów (brak, odbojnica lub odbojnice z tworzywa typu A-SAFE / Ampere) oraz zabezpieczenie tyłu: brak, wygrodzenie siatkowe pleców albo backstopy;
- orientacyjny korytarz dla wózka czołowego, reach trucka i VNA;
- rysunek wybranego rzędu i wynik gotowy do wydruku lub zapisania jako PDF.
- plan wszystkich regałów z korytarzami pracy i obracany widok 3D całego układu;
- dodawanie sekcji przez przeciągnięcie uchwytu `+` na planie lub kliknięcie półprzezroczystego `+` przy regale w widoku 3D (uchwyt na planie działa też po kliknięciu i z klawiatury).

## Założenia obliczeń

Luz boczny i między paletami wynosi orientacyjnie 75 mm w trybie standardowym oraz 100 mm w trybie NFPA 13. Dobierany jest pierwszy trawers z odpowiedniego zestawu, który pomieści wskazaną liczbę palet i wymagane luzy. Wysokość trawersu wynosi 150 mm. Do widoku przyjęto słup 100 mm, a długość rzędu jest pokazywana jako przedział dla profili 85–120 mm. Podwójny rząd ma dwie strony składowania i umowny odstęp 200 mm między nimi.

Orientacyjne szerokości korytarza: wózek czołowy 3500 mm, reach truck 2800 mm, VNA 1800 mm. Docelowy wymiar zależy od konkretnego modelu wózka i ładunku. Konfigurator nie oblicza nośności ani zgodności z przepisami; wymaga to projektu technicznego. Wariant NFPA 13 oznacza odrębny zestaw długości i przyjęty luz, a nie potwierdzenie zgodności instalacji z NFPA 13.

Każdy poziom ma edytowalne światło i wysokość ładunku. Światło przyjęte do obliczeń wynosi co najmniej wysokość ładunku + 200 mm; gdy pole użytkownika jest mniejsze, pojawia się ostrzeżenie. Pierwsza belka jest na 300 mm, każda kolejna nad poprzednią o wysokość trawersu (150 mm) i przyjęte światło. Do wyniku dodawane jest 300 mm nad najwyższym poziomem, a całość zaokrąglana w górę do 500 mm. Widok frontowy i 3D pokazują rzeczywiste różnice między poziomami i ładunkami.

Plan umieszcza korytarz przed każdym rzędem, a także za ostatnim rzędem, jeśli jest podwójny. Pokazywana głębokość układu obejmuje te korytarze. Plan i widok 3D są poglądowe; korytarze oraz model wymagają doprecyzowania dla konkretnej hali i wózka.

Zabezpieczenie tyłu jest wspólne dla wszystkich regałów. Na pojedynczym rzędzie umieszczamy je przy tylnej krawędzi, a na podwójnym po obu stronach środkowego odstępu. Plan i widok 3D pokazują siatkę jako panel, a backstopy jako poziome ograniczniki przy poziomach składowania. Ich gabaryt i mocowanie wymagają osobnego doboru.

Odbojnice słupów z tworzywa są opcją wspólną dla układu. Podgląd pokazuje osłony przy słupach od strony korytarza. Nazwy A-SAFE i Ampere oznaczają wariant wyboru w konfiguratorze; rysunki nie odwzorowują konkretnego modelu producenta ani jego parametrów.

Kolorystyka konstrukcji: słupy RAL 5010, belki RAL 1007, odbojnice RAL 1004, diagonale ramy ocynkowane (galva). Odcienie widoczne na ekranie są przybliżeniem, a ostateczny kolor należy porównać z fizycznym wzornikiem RAL. Diagonale są widoczne w modelu 3D, ponieważ znajdują się w płaszczyźnie ramy bocznej.

## Uruchomienie

Rozpakuj archiwum i otwórz `index.html` dwuklikiem. Konfigurator działa również przez serwer statyczny, np. `python3 -m http.server 4173` pod adresem `http://127.0.0.1:4173/`.

Testy obliczeń: `npm test`.

Publikacja na GitHub Pages odbywa się przez `.github/workflows/pages.yml` po włączeniu źródła **GitHub Actions** w ustawieniach Pages repozytorium.
