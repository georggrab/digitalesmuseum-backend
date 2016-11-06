# DigitalesmuseumBackend

Hallo! Dieses Projekt erfüllt die Projektrequirements `Mit einer Schnittstelle soll die Kommunikation zwischen der MySQL-­‐Datenbank und der Webplattform hergestellt werden.` sowie `Die Antwort wird wieder an die Website zurückgegeben d.h. SELECT, INSERT, UPDATE und DELETE müssen über die Schnittstelle programmiert werden.
` sowie `Editiermöglichkeit (INSERT, UPDATE, DELETE) der Informationen` des Projekts Digitalesmuseum als Teil der Vorlesung Datenbanken I an der DHBW Stuttgart.

Notiz: Der Code ist auf Github gehostet und da wahrscheinlich komfortabler einzusehen.
Die relevanten Repositories sind

 Repository | Zweck
 --- | ---
[digitalesmuseum-front](https://github.com/talkdirty/digitalesmuseum) | Hauptseite
[digitalesmuseum-cms](https://github.com/danielsimon1/digitalesmuseum-cms) | Daten hinzufügen
[digitalesmuseum-backend](https://github.com/talkdirty/digitalesmuseum-backend) | REST Backend

## Vorliegende Struktur

Dieses Projekt nutzt node.js und Swagger, um ein REST Backend für Frontend und CMS bereitzustellen.
Der relevante Code befindet sich in `api/controllers/person.js`. Hier werden die trivialen CRUD - Operationen sowie Authentifizierung implementiert.

Mithilfe von Swagger werden automatisch API Dokumentation und Routen generiert. Diese Dokumentation liegt in diesem Ordner unter `api-dokumentation.pdf` zur Einsicht bereit.
Alternativ navigieren Sie bitte zu [editor.swagger.io](http://editor.swagger.io/#/). Importieren Sie hier die Datei `api/swagger/swagger.yaml`.

Viele Grüße
Das Team DM3.
