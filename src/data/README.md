# Danish postcode data

`danish-postcodes.json` is generated from the GeoNames Danish postal-code
dataset. The data is licensed under CC BY 4.0 and is used to keep PartyMakr's
postcode lookup independent of the discontinued DAWA API.

Source: https://www.geonames.org/

To refresh it, download and extract `DK.zip` from
https://download.geonames.org/export/zip/ and run:

```bash
node scripts/generate-danish-postcodes.mjs path/to/DK.txt
```
