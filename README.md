# Rackform — konfigurator regałów paletowych

Statyczny konfigurator do wstępnego planowania regałów paletowych. Działa bez serwera i zapisuje bieżący projekt w pamięci przeglądarki.

## Funkcje

- wymiary palety z izometrycznym szkicem, liczba poziomów oraz osobne wysokości światła i ładunku na każdym poziomie; poziom 0 jest na posadzce;
- automatyczny dobór głębokości oraz przedłużenia ramy nad ostatnim poziomem z możliwością ręcznej zmiany;
- grupowe wpisywanie sekcji według długości trawersu i liczby, np. 1900 mm × 5 oraz 2700 mm × 3;
- zestawy 1000 / 1900 / 2700 / 3600 mm (standard) i 1000 / 1900 / 2850 / 3800 mm (NFPA 13);
- dowolna liczba sekcji oraz rzędów pojedynczych i podwójnych, z możliwością przełączenia typu istniejącego rzędu;
- brak wypełnienia lub panel siatkowy, krata, poprzeczki albo płyta wiórowa, wybierane osobno dla każdego poziomu; ochrona słupów: brak, odbojnica lub tuba z tworzywa zakładana na słup; zabezpieczenie tyłu: brak, wygrodzenie siatkowe pleców albo backstopy, wybierane osobno dla każdego regału;
- orientacyjny korytarz dla wózka czołowego, reach trucka i VNA;
- rysunek wybranego rzędu i wynik gotowy do wydruku lub zapisania jako PDF;
- plan wszystkich regałów z korytarzami pracy oraz interaktywny model 3D z obrotem, przybliżeniem i powiększeniem na cały ekran;
- dodawanie sekcji przez przeciągnięcie uchwytu `+` na planie lub kliknięcie półprzezroczystego `+` przy regale w widoku 3D (uchwyt na planie działa też po kliknięciu i z klawiatury).

## Założenia obliczeń

Luz boczny i między paletami wynosi orientacyjnie 75 mm w trybie standardowym oraz 100 mm w trybie NFPA 13. Dobierany jest pierwszy trawers z odpowiedniego zestawu, który pomieści wskazaną liczbę palet i wymagane luzy. Wysokość trawersu wynosi 150 mm. Do widoku przyjęto słup 100 mm, a długość rzędu jest pokazywana jako przedział dla profili 85–120 mm.

Domyślna zewnętrzna głębokość ramy jest o 100 mm mniejsza niż głębokość ładunku; można ją zmienić ręcznie i przywrócić dobór automatyczny. Gdy głębokość ramy jest równa lub większa od głębokości ładunku, konfigurator wskazuje konieczność odpowiedniego wypełnienia poziomów belkowych, np. poprzeczek lub kraty. Zamiast całkowitej wysokości ramy podawane jest jej przedłużenie powyżej ostatniego poziomu, dobierane co 250 mm; domyślny zapas wynosi 300 mm.

W podwójnym rzędzie minimalna przerwa między ładunkami wynosi 100 mm, a między ramami 200 mm. NFPA 13 lub backstopy zwiększają oba minima o 50 mm, naliczane tylko raz, również gdy wybrane są oba ustawienia. Jeśli ręcznie zmieniona głębokość ramy tego wymaga, przerwa między ramami jest powiększana, aby zachować odstęp między ładunkami. Wynik i plan pokazują oba wymiary.

Orientacyjne szerokości korytarza: wózek czołowy 3500 mm, reach truck 2800 mm, VNA 1800 mm. Docelowy wymiar zależy od konkretnego modelu wózka i ładunku. Konfigurator nie oblicza nośności ani zgodności z przepisami; wymaga to projektu technicznego. Wariant NFPA 13 oznacza odrębny zestaw długości i przyjęty luz, a nie potwierdzenie zgodności instalacji z NFPA 13.

Każdy poziom ma edytowalne światło i wysokość ładunku. Światło przyjęte do obliczeń wynosi co najmniej wysokość ładunku + 100 mm i jest zaokrąglane w górę do skoku 50 mm; gdy pole użytkownika jest mniejsze, pojawia się ostrzeżenie. Poziom 0 oznacza paletę na posadzce, a pierwsza belka jest nad nim. Każda kolejna belka znajduje się nad poprzednim poziomem o przyjęte światło; paleta stoi na górnej powierzchni belki o wysokości 150 mm. Widok frontowy i 3D pokazują różnice między poziomami i wysokościami ładunków.

Plan umieszcza korytarz przed każdym rzędem, a także za ostatnim rzędem, jeśli jest podwójny. Pokazywana głębokość układu obejmuje te korytarze. Plan i widok 3D są poglądowe; korytarze oraz model wymagają doprecyzowania dla konkretnej hali i wózka.

Globalne pole zabezpieczenia tyłu i wypełnienia poziomów ustawia wartości początkowe dla wszystkich elementów. Następnie można zmienić wypełnienie osobno przy każdym poziomie oraz wygrodzenie lub backstopy osobno przy każdym regale. Na pojedynczym rzędzie zabezpieczenie tyłu umieszczamy przy tylnej krawędzi, a na podwójnym po obu stronach środkowego odstępu. Jeśli ładunek jest głębszy od ramy, zabezpieczenie jest odsuwane o połowę różnicy głębokości, aby nie kolidowało z ładunkiem; wymiar odsunięcia jest pokazany w podsumowaniu. Plan i widok 3D pokazują wygrodzenie jako szarą siatkę, a backstopy jako poziome ograniczniki przy poziomach składowania. Ich gabaryt i mocowanie wymagają osobnego doboru.

Odbojnica z tworzywa jest tubą zakładaną na słup od strony korytarza. Model 3D pokazuje jej ogólną formę bez odwzorowania konkretnego produktu lub jego parametrów.

Kolorystyka konstrukcji: słupy RAL 5010, belki RAL 1007, odbojnice RAL 1004, diagonale ramy ocynkowane (galva). Odcienie widoczne na ekranie są przybliżeniem, a ostateczny kolor należy porównać z fizycznym wzornikiem RAL. Diagonale są widoczne w modelu 3D, ponieważ znajdują się w płaszczyźnie ramy bocznej.

## Uruchomienie

Rozpakuj archiwum i otwórz `index.html` dwuklikiem. Konfigurator działa również przez serwer statyczny, np. `python3 -m http.server 4173` pod adresem `http://127.0.0.1:4173/`.

Testy obliczeń: `npm test`. Przebudowa lokalnego skryptu 3D: `npm ci && npm run build`. Zbudowany plik `src/scene3d.bundle.js` jest częścią strony i działa bez pobierania bibliotek z CDN.

Publikacja na GitHub Pages odbywa się przez `.github/workflows/pages.yml` po włączeniu źródła **GitHub Actions** w ustawieniach Pages repozytorium.
