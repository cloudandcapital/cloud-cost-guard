// Public invented CSVs, bundled so the example needs no bill/data request.
// The regression test checks these bytes against both downloadable files.
export const SAMPLE_BILLS = [
  {
    "name": "current-example.csv",
    "text": "Date,EndDate,Service,Cost,Currency,Provider,RecordId\n2026-09-01,2026-10-01,API compute,720.125,USD,AWS,sep-compute\n2026-09-01,2026-10-01,Managed database,340,USD,AWS,sep-database\n2026-09-01,2026-10-01,Object storage,86.75,USD,AWS,sep-storage\n2026-09-01,2026-10-01,Data transfer,135,USD,AWS,sep-transfer\n2026-09-01,2026-10-01,Support,49,USD,AWS,sep-support\n2026-09-30,2026-10-01,Tax,31.5,USD,AWS,sep-tax\n2026-09-15,2026-09-16,Promotional credit,-52.25,USD,AWS,sep-credit\n"
  },
  {
    "name": "previous-example.csv",
    "text": "Date,EndDate,Service,Cost,Currency,Provider,RecordId\n2026-08-01,2026-09-01,API compute,480.1,USD,AWS,aug-compute\n2026-08-01,2026-09-01,Managed database,300,USD,AWS,aug-database\n2026-08-01,2026-09-01,Object storage,82.5,USD,AWS,aug-storage\n2026-08-01,2026-09-01,Data transfer,90,USD,AWS,aug-transfer\n2026-08-01,2026-09-01,Support,49,USD,AWS,aug-support\n2026-08-31,2026-09-01,Tax,20,USD,AWS,aug-tax\n2026-08-15,2026-08-16,Promotional credit,-25,USD,AWS,aug-credit\n"
  }
];
