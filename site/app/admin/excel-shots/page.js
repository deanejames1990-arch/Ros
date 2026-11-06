import ExcelShots from './ExcelShots';

export const metadata = { title: 'Shot boxes from Excel · James Deane Analysis' };

export default function ExcelShotsPage() {
  return (
    <>
      <p className="muted"><a href="/admin">Manage</a></p>
      <h1>Shot boxes from Excel</h1>
      <p className="muted">
        For games already on the site whose shots have no box. Upload the analyst’s workbook (sheets “(DATA) SHOTS FROM PLAY” and “(DATA) FREES”):
        each shot is matched to the tagged shot by the same team at the same video time (within 4 seconds), then gets its box (10–15) and, if the tag had none, the shooter’s name.
        You see what will change before anything is saved.
      </p>
      <ExcelShots />
    </>
  );
}
